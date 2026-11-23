const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const seriesList = require("./series.json");

const TMDB_KEY = process.env.TMDB_API_KEY;
const IMG = "https://image.tmdb.org/t/p";
const PREFIX = "aranime:";

const manifest = {
  id: "org.arabic.anime.dub",
  version: "1.1.0",
  name: "Arabic Anime Dub",
  description: "Classic Arabic-dubbed anime series",
  resources: ["catalog", "meta", "stream"],
  types: ["series"],
  idPrefixes: [PREFIX],
  catalogs: [
    {
      type: "series",
      id: "arabic-anime-catalog",
      name: "أنمي مدبلج للعربية"
    }
  ]
};

const builder = new addonBuilder(manifest);

async function fetchTMDB(path) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`);
  return res.ok ? res.json() : null;
}

function pickLogo(images) {
  const logos = images?.logos || [];
  const arabic = logos.find((l) => l.iso_639_1 === "ar");
  const chosen = arabic || logos[0];
  return chosen ? `${IMG}/w500${chosen.file_path}` : undefined;
}

builder.defineCatalogHandler(async () => {
  const metas = await Promise.all(
    seriesList.map(async (show) => {
      const data = await fetchTMDB(`/tv/${show.tmdbId}?language=ar`);
      return {
        id: `${PREFIX}${show.tmdbId}`,
        type: "series",
        name: show.customName || data?.name || "Unknown",
        poster: data?.poster_path ? `${IMG}/w500${data.poster_path}` : undefined,
        description: show.customOverview || data?.overview || ""
      };
    })
  );
  return { metas };
});

builder.defineMetaHandler(async ({ id }) => {
  const tmdbId = id.replace(PREFIX, "");
  const show = seriesList.find((s) => s.tmdbId === tmdbId);
  if (!show) return { meta: null };

  const data = await fetchTMDB(
    `/tv/${tmdbId}?language=ar&append_to_response=images&include_image_language=ar,en,null`
  );
  if (!data) return { meta: null };

  const seasons = [...new Set(Object.keys(show.episodes).map((k) => k.split(":")[0]))];
  const videos = [];

  for (const sNum of seasons) {
    const seasonData = await fetchTMDB(`/tv/${tmdbId}/season/${sNum}?language=ar`);
    const eps = seasonData?.episodes || [];

    for (const key of Object.keys(show.episodes)) {
      const [s, e] = key.split(":");
      if (s !== sNum) continue;
      const epInfo = eps.find((item) => String(item.episode_number) === e);
      videos.push({
        id: `${PREFIX}${tmdbId}:${s}:${e}`,
        season: Number(s),
        episode: Number(e),
        title: epInfo?.name || `الحلقة ${e}`,
        overview: epInfo?.overview || "",
        thumbnail: epInfo?.still_path ? `${IMG}/w500${epInfo.still_path}` : undefined,
        released: epInfo?.air_date ? new Date(epInfo.air_date).toISOString() : undefined
      });
    }
  }

  return {
    meta: {
      id,
      type: "series",
      name: show.customName || data.name,
      poster: data.poster_path ? `${IMG}/w500${data.poster_path}` : undefined,
      background: data.backdrop_path ? `${IMG}/original${data.backdrop_path}` : undefined,
      logo: show.customLogo || pickLogo(data.images),
      description: show.customOverview || data.overview || "",
      genres: (data.genres || []).map((g) => g.name),
      releaseInfo: data.first_air_date ? data.first_air_date.slice(0, 4) : "",
      videos
    }
  };
});

builder.defineStreamHandler(({ id }) => {
  const clean = id.replace(PREFIX, "");
  const [tmdbId, season, episode] = clean.split(":");
  const show = seriesList.find((s) => s.tmdbId === tmdbId);
  const url = show?.episodes?.[`${season}:${episode}`];

  if (!url) return Promise.resolve({ streams: [] });

  return Promise.resolve({
    streams: [
      {
        name: "مدبلج عربي",
        title: `الحلقة ${episode} (Archive.org)`,
        url
      }
    ]
  });
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });

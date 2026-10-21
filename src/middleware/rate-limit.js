// Limitation de débit en mémoire, par adresse IP et par règle. Suffisant pour
// un seul processus ; les compteurs repartent à zéro au redémarrage.
function rateLimit({ name, windowMs, max }) {
  const hits = new Map();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: "Too many requests, please slow down." });
    }
    next();
  };
}

module.exports = { rateLimit };

// Génération des grilles Connections dans un fil à part (worker thread).
// Le calcul est long quand les tags rendent les grilles difficiles à trouver
// (plusieurs secondes) ; dans le fil principal, il bloquait tout le serveur :
// plus aucune réponse aux joueurs, et Docker le croyait en panne.
//
// Ce fichier a deux rôles :
// - dans le fil principal : generateInWorker(...) envoie un calcul au worker
//   et renvoie une promesse ;
// - dans le worker : il reçoit { id, elements, tags, seed, options } et
//   renvoie { id, puzzle } ou { id, error }.
// Le worker ne touche pas à la base : il reçoit les éléments et les tags.
const { Worker, isMainThread, parentPort } = require("worker_threads");

if (!isMainThread) {
  const { generatePuzzle, seededRandom } = require("./connections-generator");
  parentPort.on("message", ({ id, elements, tags, seed, options }) => {
    try {
      const random = seed === null ? Math.random : seededRandom(seed);
      parentPort.postMessage({ id, puzzle: generatePuzzle(elements, tags, random, options) });
    } catch (err) {
      parentPort.postMessage({ id, error: { name: err.name, message: err.message } });
    }
  });
} else {
  let worker = null;
  let nextId = 1;
  const pending = new Map();

  // Un seul worker, créé au premier calcul et recréé s'il s'arrête. Sans
  // calcul en cours, il n'empêche pas le processus de s'arrêter (unref).
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(__filename);
    worker.on("message", ({ id, puzzle, error }) => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (!pending.size) worker?.unref();
      if (error) job.reject(Object.assign(new Error(error.message), { name: error.name }));
      else job.resolve(puzzle);
    });
    const fail = (err) => {
      worker = null;
      for (const job of pending.values()) job.reject(err);
      pending.clear();
    };
    worker.on("error", fail);
    worker.on("exit", (code) => fail(new Error(`Connections worker stopped (code ${code}).`)));
    return worker;
  }

  /**
   * Même résultat que generatePuzzle(elements, tags, seededRandom(seed),
   * options), calculé dans le worker. seed null : Math.random.
   */
  function generateInWorker(elements, tags, seed, options) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const w = getWorker();
      w.ref();
      w.postMessage({ id, elements, tags, seed, options });
    });
  }

  module.exports = { generateInWorker };
}

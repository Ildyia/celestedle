// Génération des grilles Connections dans un fil à part (worker thread).
// Le calcul est long quand les tags rendent les grilles difficiles à trouver
// (plusieurs secondes) ; dans le fil principal, il bloquait tout le serveur :
// plus aucune réponse aux joueurs, et Docker le croyait en panne.
//
// Ce fichier a deux rôles :
// - dans le fil principal : generateInWorker(...) envoie un calcul au worker
//   et renvoie une promesse ;
// - dans le worker : il reçoit { id, elements, tags, seed, options } et
//   renvoie { id, puzzle } ou { id, error } ; avec diagnose (réglages du
//   diagnostic des tags), il renvoie { id, report } (voir diagnoseTags).
// Le worker ne touche pas à la base : il reçoit les éléments et les tags.
const { Worker, isMainThread, parentPort } = require("worker_threads");

if (!isMainThread) {
  const { generatePuzzle, diagnoseTags, seededRandom } = require("./connections-generator");
  parentPort.on("message", ({ id, elements, tags, seed, options, diagnose }) => {
    try {
      if (diagnose) {
        parentPort.postMessage({ id, report: diagnoseTags(elements, tags, options, diagnose) });
        return;
      }
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
    worker.on("message", ({ id, puzzle, report, error }) => {
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      if (!pending.size) worker?.unref();
      if (error) job.reject(Object.assign(new Error(error.message), { name: error.name }));
      else job.resolve(report ?? puzzle);
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
  function send(message) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const w = getWorker();
      w.ref();
      w.postMessage({ id, ...message });
    });
  }

  const generateInWorker = (elements, tags, seed, options) => send({ elements, tags, seed, options });

  /** diagnoseTags(elements, tags, options, settings), calculé dans le worker. */
  const diagnoseInWorker = (elements, tags, options, settings = {}) => send({ elements, tags, options, diagnose: settings });

  module.exports = { generateInWorker, diagnoseInWorker };
}

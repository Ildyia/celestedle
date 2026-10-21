// Erreur prévue, renvoyée telle quelle au client par le middleware d'erreurs
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = { HttpError };

const db = require("../db");

const stmts = {
  list: db.prepare("SELECT id, name, start_date AS startDate FROM seasons ORDER BY start_date"),
  insert: db.prepare("INSERT INTO seasons (name, start_date) VALUES (?, ?)"),
  rename: db.prepare("UPDATE seasons SET name = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM seasons WHERE id = ?")
};

function list() {
  return stmts.list.all();
}

function insert(name, startDate) {
  return Number(stmts.insert.run(name, startDate).lastInsertRowid);
}

function rename(id, name) {
  return stmts.rename.run(name, id).changes === 1;
}

function remove(id) {
  return stmts.remove.run(id).changes === 1;
}

module.exports = { list, insert, rename, remove };

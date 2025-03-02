require("dotenv").config();
const Koa = require("koa");
const Router = require("koa-router");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");
const { writeFile, readFile } = fs.promises;
const serve = require("koa-static");
const bodyParser = require("koa-bodyparser");
const { connect, JSONCodec } = require("nats");

const app = new Koa();
const router = new Router();
const imagePath = path.join(__dirname, "img/image.jpg");
const PORT = process.env.PORT || 3000;
const nc = await connect({ servers: "nats://my-nats.io:4222" });
const jc = JSONCodec();

const pool = new Pool({
  user: process.env.USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.DATABASE,
});

downloadImage = async (url, filePath) => {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));
  } catch (error) {
    console.error(error.message);
  }
};

downloadImage("https://picsum.photos/1200", imagePath).catch(console.error);
setInterval(() => {
  downloadImage("https://picsum.photos/1200", imagePath).catch(console.error);
}, 3600000);

router.get("/healthz", async (ctx) => {
  try {
    await pool.query("SELECT 1");
    ctx.status = 200;
    console.log("app is healthy");
  } catch (err) {
    ctx.status = 503;
    console.log("app health check failed");
  }
});

router.get("/", async (ctx) => {
  ctx.type = "html";
  ctx.body = await readFile(path.join(__dirname, "index.html"), "utf8");
});

router.get("/todos", async (ctx) => {
  ctx.type = "html";
  const todos = await pool.query("SELECT * FROM todo");
  ctx.body = todos.rows
    .map(
      (todo) =>
        `<li hx-put="/todos/${todo.id}" hx-trigger="click" hx-swap="outerHTML">${todo.done ? "DONE" : "TODO"}: ${todo.title}</li>`,
    )
    .join("");
});

router.put("/todos/:id", async (ctx) => {
  const { id } = ctx.params;
  await pool.query("UPDATE todo SET done=true WHERE id=$1", [id]);
  nc.publish("todo_status", jc.encode({ status: "updated" }));
  const res = await pool.query("SELECT * FROM todo WHERE id=$1", [id]);
  const todo = res.rows[0];
  ctx.type = "html";
  ctx.body = `<li hx-put="/todos/${todo.id}" hx-trigger="click" hx-swap="outerHTML">${todo.done ? "DONE" : "TODO"}: ${todo.title}</li>`;
});

router.post("/todos", async (ctx) => {
  const newTodo = ctx.request.body.item;
  if (newTodo.trim().length === 0 || newTodo.length > 140) {
    console.error(
      "Invalid todo title: Please limit title to be between 1 and 140 characters",
    );
    console.error("title:", newTodo);
    ctx.staus = 400;
    ctx.body = { error: "Todo title must be between 1 and 140 characters" };
    return;
  }

  console.log(newTodo);
  await pool.query("INSERT INTO todo(title, done) VALUES($1, false)", [
    newTodo,
  ]);
  nc.publish("todo_status", jc.encode({ status: "posted" }));
  const todos = await pool.query("SELECT * FROM todo");
  ctx.type = "html";
  ctx.body = todos.rows
    .map(
      (todo) =>
        `<li hx-put="/todos/${todo.id}" hx-trigger="click" hx-swap="outerHTML">${todo.done ? "DONE" : "TODO"}: ${todo.title}</li>`,
    )
    .join("");
});

app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods())
  .use(serve(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

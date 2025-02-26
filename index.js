require("dotenv").config();
const Koa = require("koa");
const Router = require("koa-router");
const { Client } = require("pg");
const path = require("path");
const fs = require("fs");
const { writeFile, readFile } = fs.promises;
const serve = require("koa-static");
const bodyParser = require("koa-bodyparser");

const app = new Koa();
const router = new Router();
const imagePath = path.join(__dirname, "img/image.jpg");
const PORT = process.env.PORT || 3000;

const client = new Client({
  user: process.env.USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.DATABASE,
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.error("Failed to connect to PostgreSQL:", err);
  }
}

connectDB();

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

router.get("/", async (ctx) => {
  ctx.type = "html";
  ctx.body = await readFile(path.join(__dirname, "index.html"), "utf8");
});

router.get("/todos", async (ctx) => {
  ctx.type = "html";
  const todos = await client.query("SELECT * FROM todo");
  ctx.body = todos.rows.map((todo) => `<li>${todo.title}</li>`).join("");
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
  await client.query("INSERT INTO todo(title) VALUES($1)", [newTodo]);
  const todos = await client.query("SELECT * FROM todo");
  ctx.type = "html";
  ctx.body = todos.rows.map((todo) => `<li>${todo.title}</li>`).join("");
});

app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods())
  .use(serve(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

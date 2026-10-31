import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const miniRoot = path.join(root, "miniprogram");
const errors = [];
let jsonCount = 0;
let jsCount = 0;
let wxssCount = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else checkFile(full);
  }
}

function checkFile(file) {
  const relative = path.relative(root, file);
  if (file.endsWith(".json")) {
    jsonCount += 1;
    try {
      JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${relative}: JSON ${error.message}`);
    }
  }
  if (file.endsWith(".js")) {
    jsCount += 1;
    try {
      // 语法检查，不执行页面逻辑。
      new Function(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${relative}: JS ${error.message}`);
    }
  }
  if (file.endsWith(".wxss")) {
    wxssCount += 1;
    try {
      postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
    } catch (error) {
      errors.push(`${relative}: WXSS ${error.message}`);
    }
  }
}

walk(miniRoot);

const appJson = JSON.parse(fs.readFileSync(path.join(miniRoot, "app.json"), "utf8"));
for (const page of appJson.pages || []) {
  for (const ext of ["js", "json", "wxml", "wxss"]) {
    const file = path.join(miniRoot, `${page}.${ext}`);
    if (!fs.existsSync(file)) errors.push(`缺少页面文件: ${path.relative(root, file)}`);
  }
}

for (const item of (appJson.tabBar && appJson.tabBar.list) || []) {
  for (const key of ["iconPath", "selectedIconPath"]) {
    const icon = item[key];
    if (icon && !fs.existsSync(path.join(miniRoot, icon))) {
      errors.push(`缺少 tabBar 图标: ${icon}`);
    }
  }
}

const projectConfig = path.join(root, "project.config.json");
if (!fs.existsSync(projectConfig)) errors.push("缺少 project.config.json");
else {
  const config = JSON.parse(fs.readFileSync(projectConfig, "utf8"));
  if (config.miniprogramRoot !== "miniprogram/") {
    errors.push("project.config.json 的 miniprogramRoot 应为 miniprogram/");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  `miniprogram OK · ${appJson.pages.length} pages · ${jsonCount} JSON · ${jsCount} JS · ${wxssCount} WXSS`
);

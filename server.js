const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
loadEnv(path.join(ROOT, ".env"));
const PORT = Number(process.env.PORT || 3000);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
function send(res, status, body, type="application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type":type, "Cache-Control":"no-store"});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let raw=""; req.on("data",c=>{raw+=c;if(raw.length>1000000) reject(new Error("Request too large"));});
    req.on("end",()=>{try{resolve(JSON.parse(raw||"{}"));}catch{reject(new Error("Invalid JSON"));}});
    req.on("error",reject);
  });
}
const catalog = {
  openai: {label:"OpenAI", key:"OPENAI_API_KEY", model:"OPENAI_MODEL", fallback:""},
  anthropic: {label:"Anthropic Claude", key:"ANTHROPIC_API_KEY", model:"ANTHROPIC_MODEL", fallback:""},
  gemini: {label:"Google Gemini", key:"GEMINI_API_KEY", model:"GEMINI_MODEL", fallback:""}
};
async function ask(provider, prompt, system) {
  const c=catalog[provider]; if(!c) throw new Error("Unsupported provider");
  const key=process.env[c.key]; if(!key) throw new Error(c.label+" API key is not configured on the server.");
  const model=process.env[c.model];
  if (!model) throw new Error("Set "+c.model+" in the server Secrets before using "+c.label+".");
  const combined=(system ? system+"\n\n" : "")+prompt;
  let url, headers={"Content-Type":"application/json"}, body;
  if(provider==="openai"){
    url="https://api.openai.com/v1/responses"; headers.Authorization="Bearer "+key;
    body={model,input:combined};
  } else if(provider==="anthropic"){
    url="https://api.anthropic.com/v1/messages";
    headers["x-api-key"]=key; headers["anthropic-version"]="2023-06-01";
    body={model,max_tokens:1800,messages:[{role:"user",content:combined}]};
  } else {
    url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent";
    headers["x-goog-api-key"]=key;
    body={contents:[{parts:[{text:combined}]}]};
  }
  const started=Date.now();
  const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  const json=await response.json().catch(()=>({}));
  if(!response.ok){
    const msg=json?.error?.message || json?.message || ("Provider returned HTTP "+response.status);
    throw new Error(msg.slice(0,500));
  }
  let output="";
  if(provider==="openai"){
    output=json.output_text || (json.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
  } else if(provider==="anthropic"){
    output=(json.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
  } else {
    output=(json.candidates||[]).flatMap(x=>x.content?.parts||[]).map(x=>x.text||"").join("\n");
  }
  if(!output) throw new Error("The provider returned no text output.");
  return {provider,label:c.label,model,output,elapsedMs:Date.now()-started};
}

const blindTrials = new Map();
const blindRules = [
  {id:"circle_without_square", description:"The lantern glows when the circle is present and the square is absent.", test:x=>x.includes("C")&&!x.includes("S")},
  {id:"diamond_xor_triangle", description:"The lantern glows when exactly one of the diamond and triangle is present.", test:x=>x.includes("D")!==x.includes("T")},
  {id:"circle_and_triangle", description:"The lantern glows when both the circle and triangle are present.", test:x=>x.includes("C")&&x.includes("T")},
  {id:"odd_count", description:"The lantern glows when an odd number of objects is present.", test:x=>x.length%2===1}
];
const allCombos = ["D","C","T","S"].reduce((acc,x)=>acc.concat(acc.map(a=>a+x)),[""]).filter(x=>x.length>0);
function shuffled(a){const b=a.slice();for(let i=b.length-1;i>0;i--){const j=require("crypto").randomInt(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;}
function blindCreate(){
  const rule=blindRules[require("crypto").randomInt(blindRules.length)];
  const combos=shuffled(allCombos), test=combos[0], training=combos.slice(1,6);
  const id=require("crypto").randomBytes(12).toString("hex");
  blindTrials.set(id,{rule,test,observations:training.map(x=>({items:x.split(""),glow:rule.test(x)})),used:false});
  return {id,observations:blindTrials.get(id).observations,test:test.split("")};
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");

  if(req.method==="POST" && url.pathname==="/api/blind/create"){
    return send(res,200,blindCreate());
  }
  if(req.method==="POST" && url.pathname==="/api/blind/submit"){
    try{
      const b=await readBody(req),t=blindTrials.get(b.id);
      if(!t||t.used)return send(res,404,{error:"Trial not found or already revealed."});
      if(!["glow","dark"].includes(b.prediction)||!Number.isInteger(b.confidence)||b.confidence<0||b.confidence>100)return send(res,400,{error:"Invalid prediction or confidence."});
      t.used=true;const actual=t.rule.test(t.test);
      const result={actual,prediction:b.prediction,correct:(b.prediction==="glow")===actual,confidence:b.confidence,reason:String(b.reason||"").slice(0,2000),ruleDescription:t.rule.description};
      blindTrials.delete(b.id);
      return send(res,200,result);
    }catch(e){return send(res,400,{error:e.message});}
  }
  if(req.method==="GET" && url.pathname==="/api/status"){
    return send(res,200,{providers:Object.fromEntries(Object.entries(catalog).map(([id,c])=>[id,{label:c.label,configured:Boolean(process.env[c.key]),model:process.env[c.model]||c.fallback}]))});
  }
  if(req.method==="GET"){
    let requested;
    try { requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1)); }
    catch { return send(res,404,"Not found","text/plain"); }
    // Only serve explicitly public files. Never expose .env, source config or dotfiles.
    const publicFiles = new Set(["index.html","styles.css","app.js","blind-test.html","blind-test.js"]);
    if (!publicFiles.has(requested)) return send(res,404,"Not found","text/plain");
    const file=path.resolve(ROOT,requested);
    if(!file.startsWith(ROOT+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res,404,"Not found","text/plain");
    const ext=path.extname(file); const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
    return send(res,200,fs.readFileSync(file),types[ext]||"application/octet-stream");
  }
  send(res,404,{error:"Not found"});
});
server.listen(PORT,()=>console.log(`Possible Minds Lab running at http://localhost:${PORT}`));

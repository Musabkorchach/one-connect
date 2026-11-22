// Run with Node 24: node tests/call-audio-webrtc.cjs
// Uses a fresh Chrome profile and a loopback-only WebRTC fixture.
const fs=require("node:fs"), os=require("node:os"), path=require("node:path"), http=require("node:http"), {spawn}=require("node:child_process"), {stripTypeScriptTypes}=require("node:module");
const sourceRoot = path.resolve(__dirname, "../lib/connect");
const browser = process.env.ONE_CONNECT_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const strip=name=>stripTypeScriptTypes(fs.readFileSync(path.join(sourceRoot, name + ".ts"),"utf8")).replace(/^export /gm,"");
const fixture=`
<button id="dial" style="position:absolute;left:10px;top:10px">Dial</button>
<button id="answer" style="position:absolute;left:100px;top:10px">Answer</button>
<button id="retry" style="position:absolute;left:200px;top:10px" hidden>Retry</button>
<script>
`+strip("remote-call-audio")+"\n"+strip("call-media")+`
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async (check,label)=>{for(let n=0;n<120;n++){if(await check())return;await delay(50)}throw Error(label)};
const requireCheck=(value,label)=>{if(!value)throw Error(label)};
let context, A, B, sourceA, sourceB, playerA, playerB, remoteA, remoteB, mode, done;
let active, blocked, gate, released, counts, candidatesA, candidatesB;
function begin(next){
 mode=next;
 active=[];
 blocked=[];gate=next==="blocked";released=false;counts=[0,0];candidatesA=[];candidatesB=[];
 document.querySelector("#retry").hidden=true;
 done=undefined;
}
function tone(hz){
 const oscillator=context.createOscillator(), gain=context.createGain(), output=context.createMediaStreamDestination();
 oscillator.frequency.value=hz;gain.gain.value=0.1;oscillator.connect(gain).connect(output);oscillator.start();
 return {oscillator,stream:output.stream};
}
function makePlayer(index){
 requireCheck(navigator.userActivation.isActive,"no real browser activation");
 const player=createRemoteCallAudio(value=>{
  blocked.push([index,value,player.element.paused]);
  if(index===1)document.querySelector("#retry").hidden=!value;
 });
 const native=player.element.play.bind(player.element);
 player.element.play=()=>{
  if(player.element.srcObject){
   counts[index]++;
   if(index===1 && gate) return Promise.reject(new DOMException("test gate","NotAllowedError"));
  }
  return native();
 };
 return player;
}
async function negotiate(){
 await A.setLocalDescription(await A.createOffer());
 await B.setRemoteDescription(A.localDescription);
 for(const item of candidatesA.splice(0))await B.addIceCandidate(item);
 await B.setLocalDescription(await B.createAnswer());
 await A.setRemoteDescription(B.localDescription);
 for(const item of candidatesB.splice(0))await A.addIceCandidate(item);
}
document.querySelector("#dial").onclick=()=>{
 context=new AudioContext(); void context.resume();
 playerA=makePlayer(0);sourceA=tone(440);sourceB=tone(660);
 const outgoing=mode==="late" ? new MediaStream() : sourceA.stream;
 A=createCallPeer(outgoing,{iceServers:[]},{
  onRemoteStream:s=>{remoteA=s;playerA.attach(s)},
  onCandidate:c=>B?.remoteDescription?void B.addIceCandidate(c):candidatesA.push(c),
  onConnectionState:s=>{if(s==="connected")active.push("caller")}
 });
 if(mode==="late")A.addTransceiver("audio",{direction:"recvonly"});
};
document.querySelector("#answer").onclick=()=>{
 playerB=makePlayer(1);
 B=createCallPeer(sourceB.stream,{iceServers:[]},{
  onRemoteStream:s=>{remoteB=s;playerB.attach(s)},
  onCandidate:c=>A.remoteDescription?void A.addIceCandidate(c):candidatesB.push(c),
  onConnectionState:s=>{if(s==="connected")active.push("answerer")}
 });
 done=run().then(result=>({result}),error=>({error:error.message}));
};
document.querySelector("#retry").onclick=()=>{
 requireCheck(navigator.userActivation.isActive,"no real recovery gesture");
 gate=false;released=true;void playerB.resume();
};
async function hasSignal(stream){
 const analyser=context.createAnalyser(), input=context.createMediaStreamSource(stream);
 input.connect(analyser);
 const samples=new Float32Array(analyser.fftSize);
 try{await until(()=>{analyser.getFloatTimeDomainData(samples);return samples.some(x=>Math.abs(x)>0.015)},"no decoded artificial audio");}
 finally{input.disconnect();}
}
async function run(){
 try{
  await negotiate();
  await until(()=>active.length===2,"ICE did not connect both peers");
  if(mode==="late"){
   requireCheck(!remoteB?.getAudioTracks().length && counts[1]===0,"answerer attempted before late track");
   A.addTrack(sourceA.stream.getAudioTracks()[0],sourceA.stream);
   await negotiate();
  }
  await until(()=>remoteA?.getAudioTracks().length && remoteB?.getAudioTracks().length,"missing inbound tracks");
  if(mode==="blocked"){
   await until(()=>blocked.some(([id,value])=>id===1&&value),"rejection not reported");
   requireCheck(blocked.find(([id,value])=>id===1&&value)?.[2],"blocked media started before recovery");
   await until(()=>released && blocked.some(([id,value])=>id===1&&!value),"recovery not observed");
  }
  await until(()=>[playerA,playerB].every(p=>!p.element.paused&&!p.element.muted&&p.element.readyState>=2),"remote playback did not start");
  await Promise.all([hasSignal(remoteA),hasSignal(remoteB)]);
  const before=counts.join(",");
  playerA.attach(remoteA);playerB.attach(remoteB);
  for(const stream of [remoteA,remoteB])stream.getAudioTracks()[0].dispatchEvent(new Event("unmute"));
  await delay(150);
  requireCheck(counts.join(",")===before,"duplicate play");
  playerA.close();playerB.close();
  playerA.attach(remoteA);playerB.attach(remoteB);
  await Promise.all([playerA.resume(),playerB.resume()]);
  await delay(150);
  requireCheck(counts.join(",")===before && [playerA,playerB].every(p=>p.element.paused&&p.element.srcObject===null),"audio restarted after hangup");
  return mode+" passed";
 }finally{A?.close();B?.close();sourceA?.oscillator.stop();sourceB?.oscillator.stop();await context.close();A=B=remoteA=remoteB=null;}
}
</script>`;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),"oc-audio-chrome-"));
 const server=http.createServer((req,res)=>{res.setHeader("content-type","text/html");res.end(fixture)});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const chrome=spawn(browser,["--headless=new","--disable-gpu","--mute-audio","--no-first-run","--remote-debugging-port=0","--remote-allow-origins=*","--user-data-dir="+profile,"about:blank"],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
 chrome.stderr.on("data",data=>{for(const line of data.toString().split("\n"))if(line.includes("DevTools listening"))console.log("Chrome DevTools ready")});
 let socket; const maxRuntime=setTimeout(()=>{console.error("Browser fixture timed out");chrome.kill();socket?.close();server.close();process.exitCode=1},25000);
 try{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let port;
  for(let i=0;i<80&&!port;i++){try{port=Number(fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8").split("\n")[0])}catch{await sleep(250)}}
  if(!port)throw Error("No browser DevTools port");
  console.log("Found debugging port");
  const tabs=await(await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  const tab=tabs.find(t=>t.type==="page");
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=e=>j(e.error||Error("DevTools socket failed"));});
  console.log("DevTools connected");
  let id=0;const calls=new Map();
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id)calls.get(m.id)?.(m);};
  function c(method,params={}){return new Promise((r,j)=>{calls.set(++id,m=>{calls.delete(m.id);m.error?j(Error(m.error.message)):r(m.result)});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const r=await c("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.result.description);return r.result.value;}
  async function click(x){for(const type of ["mousePressed","mouseReleased"])await c("Input.dispatchMouseEvent",{type,x,y:20,button:"left",clickCount:1});}
  await c("Page.navigate",{url:"http://127.0.0.1:"+server.address().port});
  for(let i=0;i<30;i++){if(await evaluate("typeof begin")){if(await evaluate("typeof begin === 'function'"))break;}await sleep(150);}
  for(const mode of ["immediate","late","blocked"]){
   await evaluate("begin("+JSON.stringify(mode)+")");
   await click(28);await click(118);
   if(mode==="blocked"){for(let i=0;i<60;i++){if(await evaluate("!document.querySelector('#retry').hidden"))break;await sleep(100);}await click(218);}
   const answer=await evaluate("done");
   if(answer?.error||!answer?.result)throw Error(mode+": "+JSON.stringify(answer));console.log(answer.result);
  }
 }finally{clearTimeout(maxRuntime);socket?.close();chrome.kill();server.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});

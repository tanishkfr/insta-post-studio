import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/instrument-sans";
import { StudioHeader, StudioToolRail, StudioLayersPanel, StudioInspectorLayout, StudioToolSessionHeader, ContinueInMenu, type LayerItem, type ToolItem } from "../components";
import "./preview.css";

const tools: ToolItem[] = [
  {id:"image",name:"Image",purpose:"Photos & effects",enabled:true},
  {id:"vector",name:"Vector",purpose:"Paths & forms",enabled:true},
  {id:"type",name:"Type",purpose:"Lettering & typography",enabled:true},
  {id:"shapes",name:"Shapes",purpose:"3D & geometry",enabled:true},
  {id:"generate",name:"Generate",purpose:"Arrange a composition",enabled:true},
  {id:"bend",name:"BEND",purpose:"Video & motion",enabled:true}
];
const initial: LayerItem[] = [
  {id:"title",name:"A quieter kind of motion",source:"Type",kind:"text",visible:true,locked:false},
  {id:"ribbons",name:"Ribbon study",source:"Vector",kind:"vector",visible:true,locked:false},
  {id:"video",name:"Motion background",source:"BEND",kind:"video",visible:true,locked:false}
];
function App() {
  const [layers,setLayers]=useState(initial), [selected,setSelected]=useState<string|null>("title"), [tool,setTool]=useState<string|null>(null);
  const [format,setFormat]=useState("4:5"), [status,setStatus]=useState("Demo · Unsaved"), [publishing,setPublishing]=useState(false), [editing,setEditing]=useState(false);
  const [values,setValues]=useState({x:0,y:0,scale:100,rotation:0,opacity:100,blend:"Normal"});
  const current=layers.find(l=>l.id===selected) ?? null;
  const change=(id:string, key:"visible"|"locked")=>setLayers(ls=>ls.map(l=>l.id===id?{...l,[key]:!l[key]}:l));
  const move=(id:string,d:"up"|"down")=>setLayers(ls=>{const a=[...ls], i=a.findIndex(l=>l.id===id), j=i+(d==="up"?-1:1); if(i>=0&&j>=0&&j<a.length) [a[i],a[j]]=[a[j],a[i]]; return a});
  const open=(id:string, edit=false)=>{setEditing(edit);setTool(id)};
  const save=()=>{setStatus("Demo · Saving…");window.setTimeout(()=>setStatus("Demo · Save simulated"),900)};
  const publish=()=>{setPublishing(true);window.setTimeout(()=>{setPublishing(false);setTool(null);setStatus("Demo · Publish simulated")},1100)};
  return <div className="p5a-root">
    <div className="p5a-prototype">Phase 5A design prototype <span>Demo state only · no media is saved or rendered</span></div>
    <StudioHeader project="Motion study" status={status} format={format} formats={["4:5","1:1","9:16"]} editing={!!tool} onFormat={setFormat} onSave={save} onUndo={()=>{}} onRedo={()=>{}} canUndo={false} canRedo={false}/>
    {tool ? <><StudioToolSessionHeader tool={tools.find(t=>t.id===tool)?.name ?? tool} project="Motion study" artboard="Artboard 01" layer={editing && current ? current.name : "New artwork"} status={publishing ? "Rendering demo…" : "Unpublished demo edits"} publishing={publishing} updating={editing} onBack={()=>setTool(null)} onPublish={publish}/><main className="p5a-editor"><div><h1>{tools.find(t=>t.id===tool)?.name} workspace</h1><p>The original editor remains here. This placeholder does not recreate its controls.</p>{tool==="bend" && <p>BEND integration, timeline and video publishing are pending Phase 4.</p>}<button onClick={()=>setStatus("Demo · Unpublished edits")}>Mark demo as edited</button></div></main></> : <div className="p5a-layout"><StudioToolRail tools={tools} active="compose" onCompose={()=>setTool(null)} onTool={id=>open(id)}/><main className="p5a-workspace"><div className="p5a-workspace-head"><div><h1>Composition</h1><p>Artboard 01 · {format}</p></div><span>Fit to view</span></div><div className="p5a-stage"><div className={"p5a-artboard p5a-format-"+format.replace(":","-")} aria-label="Illustrative composition preview"><div className="p5a-art-label">MOTION STUDY / 01</div>{layers.find(l=>l.id==="video")?.visible && <div className="p5a-art-video" style={{zIndex: 3-layers.findIndex(l=>l.id==="video")}}><span>VIDEO LAYER · DEMO</span></div>}{layers.find(l=>l.id==="ribbons")?.visible && <div className="p5a-art-shape" style={{zIndex: 3-layers.findIndex(l=>l.id==="ribbons")}} aria-hidden="true"/>}{layers.find(l=>l.id==="title")?.visible && <div className="p5a-art-title" style={{zIndex: 3-layers.findIndex(l=>l.id==="title")}}>A quieter kind<br/>of motion<span>FORM / MOVEMENT / SPACE</span></div>}</div></div><div className="p5a-workspace-foot"><span>Artboard 01</span><span>{format} · Preview only</span></div></main><aside className="p5a-sidebar" aria-label="Layers and inspector"><StudioLayersPanel layers={layers} selectedId={selected} onSelect={setSelected} onVisibility={id=>change(id,"visible")} onLock={id=>change(id,"locked")} onRename={(id,name)=>setLayers(ls=>ls.map(l=>l.id===id?{...l,name}:l))} onMove={move} onEdit={()=>current&&open(current.source.toLowerCase(),true)}/><StudioInspectorLayout layer={current} values={values} onChange={(key,value)=>setValues(v=>({...v,[key]:key==="blend"?value:Number(value)}))} onEdit={()=>current&&open(current.source.toLowerCase(),true)}><ContinueInMenu routes={[{id:"source",label:"Edit source",description:"Open the originating tool",enabled:true},{id:"vector",label:"Create in Vector",description:"New derivative",enabled:false,reason:"Compatibility must be supplied by the host"},{id:"generate",label:"Arrange with Generate",description:"Explore layouts",enabled:true},{id:"bend",label:"Animate in BEND",description:"Video handoff",enabled:false,reason:"Pending Phase 4 integration"}]} onChoose={id=>id==="source"&&current?open(current.source.toLowerCase(),true):open(id)}/></StudioInspectorLayout></aside></div>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);




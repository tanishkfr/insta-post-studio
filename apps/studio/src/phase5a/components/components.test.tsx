import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompactPanel, ContinueInMenu, StudioInspectorLayout, StudioLayersPanel, StudioToolSessionHeader } from "./index";

describe("Phase 5A component contracts", () => {
  it("routes layer actions to the host with top-first boundaries", () => {
    const onMove = vi.fn(), onVisibility = vi.fn();
    render(<StudioLayersPanel layers={[
      {id:"a",name:"Title",source:"Type",kind:"text",visible:true,locked:false},
      {id:"b",name:"Motion",source:"BEND",kind:"video",visible:true,locked:false}
    ]} selectedId="a" onSelect={vi.fn()} onVisibility={onVisibility} onLock={vi.fn()} onRename={vi.fn()} onMove={onMove} onEdit={vi.fn()}/>);
    expect(screen.getByRole("button",{name:"Move Title up"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Move Title down"}));
    expect(onMove).toHaveBeenCalledWith("a","down");
    fireEvent.click(screen.getByRole("button",{name:"Hide Title"}));
    expect(onVisibility).toHaveBeenCalledWith("a");
  });
  it("does not enable unsupported handoffs", () => {
    const choose=vi.fn();
    render(<ContinueInMenu routes={[{id:"bend",label:"Animate in BEND",description:"Video",enabled:false,reason:"Pending integration"}]} onChoose={choose}/>);
    fireEvent.click(screen.getByRole("button", {name:"Continue in…"}));
    const button=screen.getByRole("button",{name:/Animate in BEND/});
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(choose).not.toHaveBeenCalled();
  });
  it("closes the handoff with Escape and restores focus", () => {
    render(<ContinueInMenu routes={[{id:"generate",label:"Generate",description:"Arrange",enabled:true}]} onChoose={vi.fn()}/>);
    const trigger=screen.getByRole("button",{name:"Continue in…"});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded","true");
    fireEvent.keyDown(screen.getByRole("button",{name:/Generate/}),{key:"Escape"});
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded","false");
  });
  it("reports inspector changes without mutating a layer", () => {
    const onChange=vi.fn();
    render(<StudioInspectorLayout layer={{id:"a",name:"Title",source:"Type",kind:"text",visible:true,locked:false}} values={{x:0,y:0,scale:100,rotation:0,opacity:100,blend:"Normal"}} onChange={onChange} onEdit={vi.fn()}/>);
    fireEvent.change(screen.getByRole("spinbutton",{name:"x"}),{target:{value:"24"}});
    expect(onChange).toHaveBeenCalledWith("x","24");
  });
  it("announces publish failure and routes retry", () => {
    const retry=vi.fn();
    render(<StudioToolSessionHeader tool="Vector" project="Project" artboard="Artboard" layer="Title" status="Ready" publishing={false} updating error="Publish failed" onBack={vi.fn()} onPublish={vi.fn()} onRetry={retry}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Publish failed");
    fireEvent.click(screen.getByRole("button",{name:"Retry"}));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("allows a compact panel to close explicitly or by Escape", () => {
    Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this: HTMLDialogElement) { this.setAttribute("open",""); }});
    Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this: HTMLDialogElement) { this.removeAttribute("open"); }});
    const close=vi.fn();
    render(<CompactPanel title="Tools" onClose={close}><button>Image</button></CompactPanel>);
    fireEvent(screen.getByRole("dialog",{name:"Tools"}), new Event("cancel", {bubbles:false,cancelable:true}));
    fireEvent.click(screen.getByRole("button",{name:"Close"}));
    expect(close).toHaveBeenCalledTimes(2);
  });
});

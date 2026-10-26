import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContinueInMenu, StudioLayersPanel } from "./index";

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
    const button=screen.getByRole("button",{name:/Animate in BEND/,hidden:true});
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(choose).not.toHaveBeenCalled();
  });
});


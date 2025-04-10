"use client";

import {
  ChangeEvent,
  ReactNode,
  forwardRef,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  SceneViewContext,
  SceneViewContextType,
} from "../providers/scene-view-provider";
import { Mesh } from "three";
import { CustomEvent } from "../three/SceneView";
import { RangeSlider } from "./RangeSlider";
import { MeshStandardNodeMaterial } from "three/webgpu";

function Toggle({
  title,
  onChange,
  defaultChecked,
  disabled = false,
}: {
  title: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="group">
      <div className="inline-flex items-center cursor-pointer group-has-[input:disabled]:cursor-default">
        <input
          type="checkbox"
          value=""
          className="sr-only peer"
          onChange={onChange}
          defaultChecked={defaultChecked ? true : false}
          disabled={disabled}
        />
        <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-gray-300 rounded-full peer dark:bg-gray-400 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-400 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-400"></div>
        <span className="ms-3 text-xs xl:text-sm font-medium text-gray-500 dark:text-gray-400 group-has-[input:disabled]:text-gray-200">
          {title}
        </span>
      </div>
    </label>
  );
}

enum Position {
  Start,
  Center,
  End,
}

interface AccordionRef {
  open: (b: boolean) => void;
}

interface AccordionProps {
  title: string;
  position: Position;
  open: boolean;
  children: ReactNode;
}

const Accordion = forwardRef<AccordionRef, AccordionProps>(
  ({ children, title, position, open }, ref) => {
    const [expanded, setExpanded] = useState<boolean>(open);
    const accordionBodyRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      open: (b: boolean) => setExpanded(b),
    }));

    function handleClick() {
      if (!accordionBodyRef.current) return;

      setExpanded(!expanded);
    }

    const className =
      position === Position.Center
        ? "flex items-center justify-between w-full p-5 font-medium rtl:text-right text-gray-500 border border-b border-gray-200 dark:border-gray-400 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 gap-3 hover:cursor-pointer"
        : "flex items-center justify-between w-full p-5 font-medium rtl:text-right text-gray-500 border border-b border-gray-200 rounded-t dark:border-gray-400 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 gap-3 hover:cursor-pointer";

    return (
      <div>
        <h2 id="accordion-collapse-heading">
          <button
            type="button"
            className={className}
            aria-expanded={expanded ? "true" : "false"}
            onClick={handleClick}
          >
            <span>{title}</span>
            <svg
              data-accordion-icon
              className={
                expanded ? "w-3 h-3 shrink-0" : "w-3 h-3 rotate-180 shrink-0"
              }
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 10 6"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5 5 1 1 5"
              />
            </svg>
          </button>
        </h2>
        <div
          id="accordion-collapse-body"
          ref={accordionBodyRef}
          aria-labelledby="accordion-collapse-heading"
          className={expanded ? "" : "hidden"}
        >
          <div className="p-5 border border-gray-200 dark:border-gray-400 dark:bg-gray-700">
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Accordion.displayName = "Accordion";

export function Form() {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const accordionRef1 = useRef<AccordionRef>(null);
  const accordionRef0 = useRef<AccordionRef>(null);

  const [emptyProfile, setEmptyProfile] = useState<boolean>(false);
  const { sceneView } = useContext(SceneViewContext) as SceneViewContextType;

  function handleChangeSlicingBox(e: ChangeEvent<HTMLInputElement>) {
    if (!sceneView) return;

    if (e.target.checked) {
      sceneView.toggleClippingBox(true);
    } else {
      sceneView.toggleClippingBox(false);
    }
  }

  function handleChangeCG() {
    if (!sceneView) return;

    sceneView.toggleCoordinateGrid();
  }

  function handleChangeWireframe() {
    if (!sceneView) return;

    sceneView.toggleWireFrame();
  }

  function handleCheckboxChange(name: string) {
    if (!sceneView) return;

    sceneView.toggleLayerVisibility(name);
  }

  function handleChangeTopography() {
    if (!sceneView) return;

    sceneView.toggleLayerVisibility("Topography");
  }

  function handleDrilling(e: ChangeEvent) {
    if (!sceneView) return;

    if ((e.target as HTMLInputElement).checked) {
      // Enable raycaster with callback to handle svg element
      sceneView.enableRaycaster(handleSVGCreated);
    } else {
      sceneView.disableRaycaster();
    }
  }

  function handleSVGCreated(e: CustomEvent) {
    if (
      !svgContainerRef.current ||
      !accordionRef0.current ||
      !accordionRef1.current
    )
      return;

    while (svgContainerRef.current.children.length > 0) {
      const c = svgContainerRef.current.children[0];
      svgContainerRef.current.removeChild(c);
    }

    if (e.detail && e.detail.element) {
      setEmptyProfile(false);
      svgContainerRef.current.appendChild(e.detail.element);
      accordionRef0.current.open(false);
      accordionRef1.current.open(true);
    } else {
      setEmptyProfile(true);
      accordionRef0.current.open(false);
      accordionRef1.current.open(true);
    }
  }

  function handleExport() {
    if (!sceneView) return;

    sceneView.exportOBJ();
  }

  function handleExplode(e: ChangeEvent<HTMLInputElement>) {
    if (!sceneView) return;

    if (e.target.checked) {
      sceneView.explode(true);
    } else {
      sceneView.explode(false);
    }
  }

  return (
    <div className="w-full max-h-full min-h-0 flex flex-col gap-2 dark:bg-gray-700">
      <div className="w-full flex justify-end">
        <button
          onClick={handleExport}
          className="text-white bg-red-400 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800 hover:cursor-pointer"
        >
          Export as .obj
        </button>
      </div>
      <div className="border border-gray-200 dark:border-gray-400 rounded grid grid-cols-2 gap-y-2 p-2">
        <Toggle title="Slicing Box" onChange={handleChangeSlicingBox} />
        <Toggle title="Virtual Profile" onChange={handleDrilling} />
        <Toggle title="Coordinate Grid" onChange={handleChangeCG} />
        <Toggle title="Wireframe" onChange={handleChangeWireframe} />
        <Toggle title="Topography (OSM)" onChange={handleChangeTopography} />
        <Toggle title="Explode" onChange={handleExplode} />
      </div>
      <div className="px-2 pt-2 border border-gray-200 dark:border-gray-400 rounded">
        <RangeSlider></RangeSlider>
      </div>

      <div className="overflow-y-auto">
        <Accordion
          title="Layers"
          position={Position.Start}
          open={true}
          ref={accordionRef0}
        >
          {
            <div className="flex flex-col gap-2">
              {sceneView?.model.children
                .filter((c) => c.name !== "Topography")
                .map((child) => {
                  const key = `toggle-visibility-${child.name}`;
                  let color = "transparent";
                  if (
                    (child as Mesh).material instanceof MeshStandardNodeMaterial
                  ) {
                    color = `#${(
                      (child as Mesh).material as MeshStandardNodeMaterial
                    ).color.getHexString()}`;
                  }
                  const visible = (child as Mesh).visible;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-start gap-2.5 border-b border-gray-200 dark:border-gray-400 py-1 dark:text-gray-400"
                    >
                      <span
                        className="inline-block w-5 h-5 flex-none rounded"
                        style={{
                          backgroundColor: color,
                        }}
                      ></span>
                      <input
                        id={key}
                        type="checkbox"
                        onChange={() => handleCheckboxChange(child.name)}
                        className="hover:cursor-pointer"
                        defaultChecked={visible ? true : false}
                      />
                      <label
                        htmlFor={key}
                        className="font-light text-gray-500 dark:text-gray-400"
                      >
                        {child.name}
                      </label>
                    </div>
                  );
                })}
            </div>
          }
        </Accordion>
        <Accordion
          title="Virtual Profile"
          position={Position.Center}
          open={false}
          ref={accordionRef1}
        >
          {emptyProfile ? (
            <div className="font-light text-gray-500 dark:text-gray-400 text-sm">
              Virtual profile does not intersect the model.
            </div>
          ) : null}
          <div ref={svgContainerRef} className="dark:bg-gray-400">
            <div className="font-light text-gray-500 dark:text-gray-400 dark:bg-gray-700 text-sm">
              Please enable the Virtual Profile toggle and select a profile
              position!
            </div>
          </div>
        </Accordion>
      </div>
    </div>
  );
}

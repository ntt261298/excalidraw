import { isWritableElement } from "../utils";
import Scene from "../scene/Scene";
import { isMathElement } from "./typeChecks";
import { CLASSES } from "../constants";
import { ExcalidrawElement, ExcalidrawMathElement } from "./types";
import { mutateElement } from "./mutateElement";
import App from "../components/App";

interface MathFieldElement extends HTMLElement {
  executeCommand: (command: string) => void;
}

export const mathWysiwyg = ({
  id,
  onSubmit,
  getViewportCoords,
  element,
  canvas,
  excalidrawContainer,
  app,
}: {
  id: ExcalidrawElement["id"];
  onSubmit: (data: { latex: string; coordX: number; coordY: number }) => void;
  getViewportCoords: (x: number, y: number) => [number, number];
  element: ExcalidrawMathElement;
  canvas: HTMLCanvasElement | null;
  excalidrawContainer: HTMLDivElement | null;
  app: App;
}) => {
  let coordX = 0;
  let coordY = 0;
  const updateWysiwygStyle = () => {
    const appState = app.state;
    const updatedMathElement = Scene.getScene(
      element,
    )?.getElement<ExcalidrawMathElement>(element.id);
    if (!updatedMathElement) {
      return;
    }
    if (updatedMathElement && isMathElement(updatedMathElement)) {
      coordX = updatedMathElement.x;
      coordY = updatedMathElement.y;
      // Set to element height by default since that's
      // what is going to be used for unbounded text
      const [viewportX, viewportY] = getViewportCoords(coordX, coordY);
      const editorMaxHeight =
        (appState.height - viewportY) / appState.zoom.value;

      Object.assign(mathNode.style, {
        left: `${viewportX}px`,
        top: `${viewportY}px`,
        opacity: updatedMathElement.opacity / 100,
        filter: "var(--theme-filter)",
        maxHeight: `${editorMaxHeight}px`,
      });

      mutateElement(updatedMathElement, { x: coordX, y: coordY });
    }
  };

  // Create math field dom element
  const mathFieldString = "<math-field></math-field>";
  const tempNode = document.createElement("div");
  tempNode.innerHTML = mathFieldString;
  const mathNode = tempNode.childNodes[0] as MathFieldElement;

  Object.assign(mathNode.style, {
    position: "absolute",
    display: "inline-block",
    minHeight: "1em",
    backfaceVisibility: "hidden",
    margin: 0,
    padding: 0,
    border: 0,
    outline: 0,
    resize: "none",
    background: "transparent",
    overflow: "hidden",
    zIndex: "var(--zIndex-wysiwyg)",
    overflowWrap: "break-word",
    boxSizing: "content-box",
  });
  updateWysiwygStyle();

  const stopEvent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSubmit = (e: any) => {
    // Hide keyboard before remove blur event listener
    mathNode.executeCommand("hideVirtualKeyboard");
    // cleanup must be run before onSubmit otherwise when app blurs the wysiwyg
    // it'd get stuck in an infinite loop of blur→onSubmit after we re-focus the
    // wysiwyg on update
    cleanup();

    const updateElement = Scene.getScene(element)?.getElement(
      element.id,
    ) as ExcalidrawMathElement;
    if (!updateElement) {
      return;
    }
    const latex: string = e.target.value || null;

    // Remove math element before submit
    app.scene.removeElement(id);

    onSubmit({
      latex,
      coordX,
      coordY,
    });
  };

  const cleanup = () => {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;
    // remove events to ensure they don't late-fire
    mathNode.onblur = null;
    mathNode.oninput = null;
    mathNode.onkeydown = null;

    if (observer) {
      observer.disconnect();
    }

    window.removeEventListener("resize", updateWysiwygStyle);
    window.removeEventListener("wheel", stopEvent, true);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", bindBlurEvent);
    window.removeEventListener("blur", handleSubmit);

    unbindUpdate();

    mathNode.remove();
  };

  const bindBlurEvent = (event?: MouseEvent) => {
    window.removeEventListener("pointerup", bindBlurEvent);
    // Deferred so that the pointerdown that initiates the wysiwyg doesn't
    // trigger the blur on ensuing pointerup.
    // Also to handle cases such as picking a color which would trigger a blur
    // in that same tick.
    const target = event?.target;

    const isTargetColorPicker =
      target instanceof HTMLInputElement &&
      target.closest(".color-picker-input") &&
      isWritableElement(target);

    setTimeout(() => {
      mathNode.onblur = handleSubmit;
      if (target && isTargetColorPicker) {
        target.onblur = () => {
          mathNode.focus();
        };
      }
      // case: clicking on the same property → no change → no update → no focus
      if (!isTargetColorPicker) {
        mathNode.focus();
      }
    });
  };

  // prevent blur when changing properties from the menu
  const onPointerDown = (event: MouseEvent) => {
    const isTargetColorPicker =
      event.target instanceof HTMLInputElement &&
      event.target.closest(".color-picker-input") &&
      isWritableElement(event.target);
    if (
      ((event.target instanceof HTMLElement ||
        event.target instanceof SVGElement) &&
        event.target.closest(`.${CLASSES.SHAPE_ACTIONS_MENU}`) &&
        !isWritableElement(event.target)) ||
      isTargetColorPicker
    ) {
      mathNode.onblur = null;
      window.addEventListener("pointerup", bindBlurEvent);
      // handle edge-case where pointerup doesn't fire e.g. due to user
      // alt-tabbing away
      window.addEventListener("blur", handleSubmit);
    }
  };

  // handle updates of textElement properties of editing element
  const unbindUpdate = Scene.getScene(element)!.addCallback(() => {
    updateWysiwygStyle();
    const isColorPickerActive = !!document.activeElement?.closest(
      ".color-picker-input",
    );
    if (!isColorPickerActive) {
      mathNode.focus();
    }
  });

  // ---------------------------------------------------------------------------

  let isDestroyed = false;
  // select on init (focusing is done separately inside the bindBlurEvent()
  // because we need it to happen *after* the blur event from `pointerdown`)
  //   editable.select();
  bindBlurEvent();

  // reposition wysiwyg in case of canvas is resized. Using ResizeObserver
  // is preferred so we catch changes from host, where window may not resize.
  let observer: ResizeObserver | null = null;
  if (canvas && "ResizeObserver" in window) {
    observer = new window.ResizeObserver(() => {
      updateWysiwygStyle();
    });
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", updateWysiwygStyle);
  }

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("wheel", stopEvent, {
    passive: false,
    capture: true,
  });
  excalidrawContainer
    ?.querySelector(".gotitdraw-mathEditorContainer")
    ?.appendChild(mathNode);
  // Show Math Editor
  mathNode.executeCommand("showVirtualKeyboard");
};

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MathJaxContext } from "better-react-mathjax";
import ExcalidrawApp from "./excalidraw-app";

import "./excalidraw-app/pwa";
import "./excalidraw-app/sentry";
window.__EXCALIDRAW_SHA__ = process.env.REACT_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <MathJaxContext
      src={"/tex-mml-svg.js"}
      config={{
        loader: {
          load: ["/input/asciimath", "/output/chtml"],
        },
        options: {
          enableMenu: false,
        },
      }}
    >
      <ExcalidrawApp />
    </MathJaxContext>
  </StrictMode>,
);

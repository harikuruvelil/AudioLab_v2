import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./mobile.css";
import { installUpdates } from "./updates";
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  installUpdates();
}

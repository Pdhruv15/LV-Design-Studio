/** The page loaded when opened. Its text changes with the build (WEB_UPDATE_BUILD), so its file name does too. */
export default function Later() {
  return <p id="later">{import.meta.env.VITE_WEB_UPDATE_BUILD as string}</p>;
}

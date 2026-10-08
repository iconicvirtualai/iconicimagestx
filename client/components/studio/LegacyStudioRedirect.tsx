import { Navigate, useLocation } from "react-router-dom";
import { STUDIO_EDITOR_PATH, legacyStudioRedirect } from "@shared/studioEditorHref";

/** Old staff studio bookmarks land on the photo editor, with the listing id kept. */
export default function LegacyStudioRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={legacyStudioRedirect(pathname, search) || STUDIO_EDITOR_PATH} replace />;
}

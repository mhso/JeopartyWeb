/**
 * Resolves the static-folder-relative paths the API returns into real URLs.
 *
 * The backend keeps serving /jeoparty/static/ exactly as it does today -- no
 * change there. Model dumps hand back paths like "data/packs/<id>/foo.png" or
 * "img/check.png", which is what `url_for('static', filename=...)` used to
 * consume in the Jinja templates.
 */

const STATIC_BASE = "/jeoparty/static";

/** `staticUrl("img/check.png")` -> "/jeoparty/static/img/check.png" */
export function staticUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//.test(path) || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  return `${STATIC_BASE}/${path.replace(/^\/+/, "")}`;
}

/** Resolves an asset inside a theme's data folder. */
export function themeAssetUrl(dataPath: string, src: string): string {
  return staticUrl(`${dataPath}/${src}`)!;
}

/**
 * The join URL shown on the presenter's lobby screen and typed into phones.
 * Kept deliberately short -- see the routing note in API_BLUEPRINT.md about
 * why contestants live at /jeoparty/<join_code> rather than /jeoparty/play/.
 */
export function joinUrl(externalHost: string, joinCode: string): string {
  return `${externalHost.replace(/\/+$/, "")}/jeoparty/${joinCode}`;
}

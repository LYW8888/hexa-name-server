import landscapeURL from '../assets/moon-mountains.webp';

// Share the decoded same-origin picture with the local canvas exporter.
// Clear failures so a later download can retry after the connection recovers.
let pending;
export function loadLandscapeArt() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const picture = new Image();
    const timer = setTimeout(() => finish(new Error('landscape timeout')), 10000);
    function finish(error) {
      clearTimeout(timer);
      picture.onload = null;
      picture.onerror = null;
      if (error) reject(error);
      else resolve(picture);
    }
    picture.onload = () => finish();
    picture.onerror = () => finish(new Error('landscape unavailable'));
    picture.src = landscapeURL;
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}

// Inline script for the root layout: moves an organiser key (#k=) or personal link (#p=) out of the address bar before
// first paint, into a page-lifetime global that lib/client/storage.ts reads.

// Runs while the HTML is parsed, before any JS bundle, so the secret never lingers in the URL bar (screenshots, the
// browser's own Share or Copy link) even when JS is slow or fails. Only /h/ pages, only #k= / #p= hashes.
export const HASH_CAPTURE_SCRIPT = `(function(){try{var l=location,h=l.hash;if(h.length>1&&/(^#|&)(k|p)=/.test(h)&&l.pathname.indexOf('/h/')===0){window.__hangsHash={path:l.pathname,hash:h};history.replaceState(history.state,'',l.pathname+l.search)}}catch(e){}})()`

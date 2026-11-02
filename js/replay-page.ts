// The replay page (replay.html): plays a recording in the game's own page (an iframe), trims it, sets camera keys, and shares it
// as a file, a video, a screenshot or (with a host's replayStore) a link. Moved here from replay.html's inline module.
// The page's parts live in src/replay/page/, one module each (each says what it owns); importing the last one runs them all in their
// original order (each imports the one before it first).
import "../src/config";
import "../src/core/plugins";
import "./record";
import "./film";
import "../src/replay/page/video";


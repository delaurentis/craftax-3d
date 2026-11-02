// What things are called on screen under a theme (Theme.names: Winter's cows are reindeer): the game's ids ("cow", "zombie",
// "eat_cow"...) as the player reads them, and any text that names them (an achievement, how you died). Only what is shown: the
// game, recordings, replays and the bots keep the game's own names.
import { onScreen } from "./state";

const words = (id: string) => id.toLowerCase().replace(/_/g, " ");
/** A thing's name on screen: the theme's own, else the game's id as words ("gnome_archer": "gnome archer"). */
export function nameOf(id: string): string {
  return onScreen.to?.names?.[id] ?? words(id);
}
/** Text with the theme's names in it: each thing it names, as a whole word, in the theme's word (a capital kept). */
export function themedText(text: string): string {
  const names = onScreen.to?.names;
  if (!names) return text;
  let out = text;
  for (const [id, name] of Object.entries(names)) {
    out = out.replace(new RegExp(`\\b${words(id)}\\b`, "gi"), (m) => (m[0] === m[0].toUpperCase() ? name[0].toUpperCase() + name.slice(1) : name));
  }
  return out;
}

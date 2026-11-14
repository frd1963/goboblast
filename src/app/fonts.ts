import {
  Bangers,
  Bebas_Neue,
  Bubblegum_Sans,
  Caveat,
  Cinzel,
  Comic_Neue,
  Comfortaa,
  Cormorant_Garamond,
  Dancing_Script,
  Fredoka,
  Great_Vibes,
  Libre_Baskerville,
  Lobster,
  Merriweather,
  Montserrat,
  Oswald,
  Pacifico,
  Parisienne,
  Permanent_Marker,
  Playfair_Display,
  Roboto_Slab,
} from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "700",
  variable: "--font-montserrat",
});
const oswald = Oswald({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "500",
  variable: "--font-oswald",
});
const bebas = Bebas_Neue({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-bebas",
});
const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-roboto-slab",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "700",
  variable: "--font-playfair",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-cormorant",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-cinzel",
});
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "700",
  variable: "--font-libre-baskerville",
});
const merriweather = Merriweather({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "700",
  variable: "--font-merriweather",
});
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-great-vibes",
});
const parisienne = Parisienne({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-parisienne",
});
const dancing = Dancing_Script({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-dancing",
});
const pacifico = Pacifico({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-pacifico",
});
const lobster = Lobster({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-lobster",
});
const fredoka = Fredoka({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "500",
  variable: "--font-fredoka",
});
const comfortaa = Comfortaa({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-comfortaa",
});
const comicNeue = Comic_Neue({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "700",
  variable: "--font-comic-neue",
});
const bubblegum = Bubblegum_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-bubblegum",
});
const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "600",
  variable: "--font-caveat",
});
const permanentMarker = Permanent_Marker({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-permanent-marker",
});
const bangers = Bangers({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  variable: "--font-bangers",
});

export const goboFontClassName = [
  montserrat,
  oswald,
  bebas,
  robotoSlab,
  playfair,
  cormorant,
  cinzel,
  libreBaskerville,
  merriweather,
  greatVibes,
  parisienne,
  dancing,
  pacifico,
  lobster,
  fredoka,
  comfortaa,
  comicNeue,
  bubblegum,
  caveat,
  permanentMarker,
  bangers,
]
  .map((font) => font.variable)
  .join(" ");

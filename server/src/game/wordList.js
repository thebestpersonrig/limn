export const words = [
  // Animals
  "cat", "dog", "elephant", "giraffe", "penguin", "shark", "dolphin", "parrot",
  "tiger", "lion", "zebra", "kangaroo", "panda", "octopus", "butterfly", "crocodile",
  "owl", "eagle", "crab", "jellyfish", "whale", "monkey", "gorilla", "cheetah",

  // Food
  "pizza", "burger", "spaghetti", "sushi", "taco", "hotdog", "sandwich", "donut",
  "cupcake", "watermelon", "pineapple", "strawberry", "banana", "avocado", "broccoli",
  "pretzel", "popcorn", "waffle", "pancake", "ice cream",

  // Objects
  "umbrella", "telescope", "backpack", "bicycle", "camera", "compass", "lantern",
  "mailbox", "mirror", "pillow", "scissors", "suitcase", "trophy", "violin",
  "telescope", "hourglass", "microscope", "thermometer", "ladder", "magnifying glass",

  // Places
  "volcano", "lighthouse", "castle", "pyramid", "igloo", "treehouse", "library",
  "aquarium", "stadium", "windmill", "waterfall", "cave", "island", "glacier",

  // Actions / Concepts
  "flying", "sleeping", "swimming", "dancing", "climbing", "explosion", "rainbow",
  "shadow", "tornado", "earthquake", "sunset", "thunderstorm", "avalanche",

  // Pop culture / Fun
  "astronaut", "pirate", "ninja", "wizard", "mermaid", "vampire", "robot",
  "superhero", "zombie", "knight", "cowboy", "detective", "alien",

  // Technology
  "smartphone", "headphones", "keyboard", "satellite", "rocket", "submarine",
  "helicopter", "drone", "spaceship",

  // Sports
  "surfing", "skateboard", "basketball", "archery", "boxing", "gymnastics",
  "skiing", "bowling", "volleyball",
];

export function getRandomWords(count = 3) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

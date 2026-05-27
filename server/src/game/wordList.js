export const words = [
  // Simple shapes & symbols
  "heart", "star", "arrow", "spiral", "circle", "smiley face", "sad face",
  "lightning bolt", "rainbow", "question mark", "exclamation mark", "cross",
  "diamond", "crown", "skull", "eye", "thumbs up", "peace sign",

  // Sky & weather (clear silhouettes)
  "sun", "moon", "cloud", "rain", "snowflake", "snowman", "rainbow",
  "lightning", "shooting star", "crescent moon", "sunset",

  // Nature (simple shapes)
  "tree", "flower", "cactus", "mushroom", "leaf", "grass", "mountain",
  "volcano", "wave", "island", "campfire", "snowman",

  // Food (iconic shapes)
  "pizza", "donut", "ice cream", "burger", "hot dog", "banana", "apple",
  "watermelon", "cherry", "lollipop", "candy cane", "cake", "cupcake",
  "egg", "bread", "pretzel", "taco", "popsicle", "fries",

  // Simple animals (distinctive shape)
  "fish", "snail", "butterfly", "spider", "crab", "jellyfish", "octopus",
  "swan", "flamingo", "penguin", "duck", "cat", "dog", "rabbit", "snake",
  "turtle", "frog", "bee", "ant", "worm", "starfish",

  // Vehicles (clear side-view shape)
  "car", "bus", "boat", "plane", "rocket", "bicycle", "submarine",
  "hot air balloon", "helicopter", "train", "skateboard", "canoe",
  "ambulance", "fire truck", "sailboat",

  // Buildings & structures (simple outline)
  "house", "castle", "igloo", "tent", "lighthouse", "bridge", "windmill",
  "pyramid", "barn", "treehouse",

  // Objects with unique shape
  "umbrella", "key", "lock", "scissors", "hourglass", "magnifying glass",
  "anchor", "compass", "ladder", "telescope", "trophy", "medal",
  "kite", "balloon", "bowtie", "glasses", "crown", "hat", "boot",
  "sock", "glove", "ring", "envelope", "flag", "lantern", "candle",
  "clock", "alarm clock", "phone", "pencil", "ruler", "paintbrush",
  "guitar", "drum", "trumpet", "microphone", "headphones",
  "book", "newspaper", "camera", "lightbulb", "battery", "plug",
  "magnet", "syringe", "thermometer", "comb", "toothbrush",
  "hammer", "wrench", "saw", "nail", "screw",
  "bucket", "broom", "mop", "trash can", "mirror",
  "chair", "table", "bed", "door", "window", "stairs", "ladder",
  "mailbox", "streetlight", "traffic light", "stop sign", "fence",

  // Stick figure actions (draw a stick figure doing it)
  "sleeping", "running", "jumping", "swimming", "surfing", "skiing",
  "dancing", "eating", "reading", "fishing", "climbing", "falling",
  "flying", "sitting", "waving", "boxing", "yoga",

  // Fantasy / fun (iconic shapes)
  "ghost", "alien", "robot", "wizard hat", "magic wand",
  "dragon", "unicorn", "sword", "shield", "bomb", "cannon",
  "spaceship", "ufo", "black hole",

  // Misc (very visual)
  "footprint", "handprint", "shadow", "explosion", "tornado",
  "whirlpool", "target", "gift box", "treasure chest", "map",
  "trophy", "podium", "finish line", "scoreboard",
];

export function getRandomWords(count = 3) {
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Wordlists for the gaming name generators. Compact but varied — each list is
 * 32–48 words so combinations are non-repetitive.
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function combine(parts: string[][], separator = ''): string {
  return parts.map(pick).join(separator);
}

export const FANTASY_ADJ = ['Iron', 'Storm', 'Shadow', 'Crimson', 'Frost', 'Bright', 'Silent', 'Wild', 'Ember', 'Hollow', 'Bone', 'Dread', 'Twilight', 'Moon', 'Sun', 'Star', 'Black', 'White', 'Grim', 'Pale', 'Wandering', 'Howling', 'Sacred', 'Cursed', 'Eternal', 'Lost', 'Forsaken', 'Brave', 'Cruel', 'Noble', 'Burning', 'Frozen', 'Drowned', 'Thorn', 'Raven', 'Wolf'];
export const FANTASY_NOUN = ['Blade', 'Crown', 'Throne', 'Heart', 'Reign', 'Oath', 'Sigil', 'Banner', 'Hammer', 'Wraith', 'Shadow', 'Dawn', 'Dusk', 'Citadel', 'Spire', 'Vale', 'Vow', 'Sigil', 'Hall', 'Keep', 'Watch', 'Reach', 'Hollow', 'Veil', 'Whisper', 'Echo', 'Storm', 'Flame', 'Frost', 'Mist', 'Wolf', 'Lion', 'Stag', 'Raven', 'Drake', 'Wyrm'];

export const SCI_FI_ADJ = ['Quantum', 'Plasma', 'Cyber', 'Neon', 'Void', 'Stellar', 'Cosmic', 'Solar', 'Nova', 'Astro', 'Hyper', 'Mega', 'Photon', 'Vector', 'Binary', 'Synth', 'Helix', 'Pulse', 'Apex', 'Ion', 'Tachyon', 'Warp', 'Singular', 'Orbital', 'Lunar', 'Galactic', 'Nebular', 'Atomic', 'Cryo', 'Aero'];
export const SCI_FI_NOUN = ['Drive', 'Core', 'Matrix', 'Protocol', 'Cipher', 'Reactor', 'Pulse', 'Helix', 'Drone', 'Shard', 'Cluster', 'Mantle', 'Citadel', 'Probe', 'Cradle', 'Saber', 'Wraith', 'Lance', 'Beacon', 'Sentinel', 'Engine', 'Forge', 'Frame', 'Vector', 'Pilot', 'Captain', 'Rogue', 'Specter', 'Echo', 'Halo'];

export const WEAPONS = ['Blade', 'Sword', 'Dagger', 'Lance', 'Spear', 'Hammer', 'Axe', 'Bow', 'Crossbow', 'Glaive', 'Halberd', 'Scythe', 'Mace', 'Cleaver', 'Falchion', 'Katana', 'Rapier', 'Scimitar', 'Whip', 'Staff', 'Wand', 'Rifle', 'Cannon', 'Pistol', 'Carbine'];
export const WEAPON_ADJ  = ['Razor', 'Soul', 'Doom', 'Star', 'Sky', 'Ash', 'Bone', 'Blood', 'Sun', 'Moon', 'Storm', 'Frost', 'Ember', 'Iron', 'Steel', 'Obsidian', 'Crystal', 'Shadow', 'Light', 'Dawn', 'Dusk', 'Void', 'Phoenix', 'Dragon', 'Hawk', 'Wolf', 'Tiger', 'Viper'];
export const WEAPON_OF   = ['the Phoenix', 'the Wolf', 'the Stars', 'the Abyss', 'the King', 'the Storm', 'Eternity', 'the Sun', 'the Moon', 'Ash', 'Twilight', 'the Lost', 'the Forsaken', 'Whispers', 'a Thousand Suns', 'Endings'];

export const SPELL_PREFIX = ['Arcane', 'Holy', 'Dark', 'Fire', 'Ice', 'Lightning', 'Earth', 'Wind', 'Soul', 'Spirit', 'Blood', 'Shadow', 'Light', 'Time', 'Void', 'Mind', 'Death', 'Life', 'Nature', 'Chaos'];
export const SPELL_VERB = ['Bolt', 'Blast', 'Strike', 'Surge', 'Pulse', 'Storm', 'Burst', 'Ward', 'Shield', 'Veil', 'Shroud', 'Bind', 'Curse', 'Charm', 'Hex', 'Sigil', 'Rune', 'Touch', 'Wave', 'Fury'];

export const QUEST_VERB = ['Hunt for', 'Tomb of', 'Trial of', 'Quest of', 'Riddle of', 'Curse of', 'Path of', 'Awakening of', 'Last Stand of', 'Whispers of', 'Shadow of', 'Eye of', 'Heart of', 'Crown of', 'Sigil of'];
export const QUEST_NOUN = ['the Old King', 'the Lost Star', 'the Forsaken', 'the Stoneheart', 'the Iron Wolf', 'Ashfall', 'the Silver Vale', 'the Sleeping Dragon', 'the Hollow Tower', 'the Black Tide', 'the Drowned City', 'Eternal Frost', 'the Pale Sun', 'the First Flame', 'the Final Dawn'];

export const TEAM_ADJ = ['Mighty', 'Wild', 'Silent', 'Furious', 'Steel', 'Iron', 'Velvet', 'Shadow', 'Lightning', 'Thunder', 'Sky', 'Storm', 'Royal', 'Crimson', 'Black', 'Bright', 'Polar', 'Magnetic', 'Atomic', 'Stellar', 'Rebel'];
export const TEAM_NOUN = ['Wolves', 'Hawks', 'Vipers', 'Titans', 'Warriors', 'Reapers', 'Phoenix', 'Dragons', 'Giants', 'Falcons', 'Pirates', 'Raiders', 'Saints', 'Outlaws', 'Knights', 'Lions', 'Bears', 'Cyclones', 'Comets', 'Aces', 'Foxes', 'Vipers', 'Stallions', 'Jackals'];

export const GUILD_ADJ = ['Ancient', 'Silent', 'Iron', 'Eternal', 'Hidden', 'Sacred', 'Crimson', 'Frozen', 'Wandering', 'Forgotten', 'Sworn', 'Bound', 'Free', 'Last', 'First', 'High', 'True'];
export const GUILD_NOUN = ['Order', 'Brotherhood', 'Society', 'League', 'Coven', 'Circle', 'Court', 'Council', 'Pact', 'Compact', 'Sect', 'Vanguard', 'Hand', 'Eye', 'Heart', 'Shield', 'Spear', 'Banner'];

export const USERNAME_PRE = ['cool', 'dark', 'fast', 'epic', 'mega', 'super', 'pro', 'lone', 'night', 'fire', 'frost', 'shadow', 'silent', 'iron', 'gold', 'silver', 'rapid', 'turbo', 'phantom', 'lunar', 'solar', 'cyber', 'neon', 'pixel', 'binary'];
export const USERNAME_MID = ['wolf', 'fox', 'hawk', 'eagle', 'dragon', 'tiger', 'lion', 'shark', 'phoenix', 'raven', 'snake', 'panda', 'falcon', 'viper', 'cobra', 'lynx', 'mantis', 'orca', 'puma', 'rhino'];

export const CHARACTER_FIRST = ['Aria', 'Cael', 'Dax', 'Eira', 'Finn', 'Greta', 'Hale', 'Ilse', 'Joren', 'Kira', 'Lior', 'Maven', 'Nyx', 'Orin', 'Pax', 'Quinn', 'Rin', 'Sera', 'Tael', 'Una', 'Vex', 'Wyn', 'Xal', 'Yara', 'Zev', 'Asha', 'Bram', 'Cael', 'Drake', 'Eryn'];
export const CHARACTER_LAST = ['Stoneheart', 'Ravensong', 'Brightblade', 'Frostfall', 'Ironwood', 'Wolfborne', 'Dawnstrider', 'Nightveil', 'Stormwarden', 'Embergrove', 'Mooncrest', 'Sunshade', 'Goldspire', 'Silverdew', 'Shadowmere', 'Hollowmar', 'Thornheart', 'Wildfern', 'Drakewing', 'Falconmoor'];

export const GAMING_PRE  = ['x', 'iX', 'Lord', 'Sir', 'Lady', 'King', 'Queen', 'Mr', 'Ms', 'Lil', 'Big', 'The', 'NotA', 'Real', 'Itz', 'YT', 'TTV', ''];
export const GAMING_POST = ['_TTV', '_HD', 'Pro', 'X', 'YT', '420', '777', '88', '_', '99', 'God', 'King', 'GG', ''];

export const CLAN_TAGS = ['SVN', 'NOX', 'FRG', 'ZEN', 'TIDE', 'RIFT', 'EDGE', 'WOLF', 'IRON', 'PURE', 'NULL', 'ZERO', 'NOVA', 'KIRA', 'AERO', 'GHST', 'ARC', 'OBS', 'CIPH', 'ECHO', 'HALO', 'ION'];
export const CLAN_FULL = ['Nightfall', 'Sundown', 'Stormbreak', 'Frostline', 'Bloodtide', 'Iron Resolve', 'Black Crown', 'Pale Sun', 'Last Light', 'First Frost', 'Crimson Vow', 'Silent Order', 'Hidden Hand', 'Lone Pack', 'Static Pulse'];

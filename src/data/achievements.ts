export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_delivery', name: 'Signed, Sealed', desc: 'Complete your first delivery.', reward: 30 },
  { id: 'tall_order', name: 'Tall Order', desc: 'Carry 8 items in one column at once.', reward: 80 },
  { id: 'skyscraper', name: 'Skyscraper', desc: 'Build a stack over 5 meters tall.', reward: 120 },
  { id: 'saved_it', name: 'Saved It!', desc: 'Recover from critical stability 5 times (total).', reward: 80 },
  { id: 'hero_shed', name: 'Sacrifice Accepted', desc: 'Shed cargo to dodge a low beam or save a wobble.', reward: 40 },
  { id: 'cake_boss', name: 'Cake Boss', desc: 'Deliver 10 cakes without a scratch (total).', reward: 120 },
  { id: 'world1', name: 'Harbor Master', desc: 'Complete Sunlit Harbor.', reward: 150 },
  { id: 'world2', name: 'Canyon Runner', desc: 'Complete Canyon Express.', reward: 200 },
  { id: 'world3', name: 'Night Owl', desc: 'Complete Midnight Market.', reward: 250 },
  { id: 'all_gold_w1', name: 'Shipshape', desc: 'Earn all 30 medals in Sunlit Harbor.', reward: 300 },
  { id: 'long_hauler', name: 'Long Hauler', desc: 'Drive 3,000 m in one Long Haul run.', reward: 150 },
  { id: 'banker', name: 'Safe Deposit', desc: 'Bank 500 coins in one Long Haul run.', reward: 150 },
  { id: 'daily_driver', name: 'Daily Driver', desc: 'Complete a Daily Contract.', reward: 60 },
  { id: 'collector', name: 'Curator of Cargo', desc: 'Discover every cargo item in the album.', reward: 250 },
  { id: 'fleet', name: 'Fleet Owner', desc: 'Own all five trucks.', reward: 400 },
  { id: 'maestro', name: 'Near-Miss Maestro', desc: 'Pull off 15 near misses in one run.', reward: 100 },
];

/* ==========================================================================
   Playing XIs for Quick Match, in batting order. bowl: the bowlers used, in
   the order they take overs, with their type (pace or spin).
   ========================================================================== */
export const SQUADS = {
  IND: {
    code: "IND", name: "India",
    players: ["Rohit Sharma", "Shubman Gill", "Virat Kohli", "Shreyas Iyer", "KL Rahul", "Hardik Pandya",
      "Ravindra Jadeja", "Axar Patel", "Kuldeep Yadav", "Jasprit Bumrah", "Mohammed Siraj"],
    keeper: "KL Rahul", captain: "Rohit Sharma",
    bowl: [["Jasprit Bumrah", "pace"], ["Mohammed Siraj", "pace"], ["Kuldeep Yadav", "spin"], ["Hardik Pandya", "pace"], ["Ravindra Jadeja", "spin"]]
  },
  AUS: {
    code: "AUS", name: "Australia",
    players: ["Travis Head", "Mitchell Marsh", "Steve Smith", "Marnus Labuschagne", "Glenn Maxwell", "Josh Inglis",
      "Marcus Stoinis", "Pat Cummins", "Mitchell Starc", "Adam Zampa", "Josh Hazlewood"],
    keeper: "Josh Inglis", captain: "Pat Cummins",
    bowl: [["Mitchell Starc", "pace"], ["Josh Hazlewood", "pace"], ["Adam Zampa", "spin"], ["Pat Cummins", "pace"], ["Glenn Maxwell", "spin"]]
  }
};

/* "Virat Kohli" -> "V. Kohli" for tight spaces on the HUD */
export function shortName(name) {
  const parts = name.split(" ");
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

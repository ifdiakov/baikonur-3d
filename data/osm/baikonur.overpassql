[out:json][timeout:80][bbox:45.58,62.75,46.25,64.25];
(
  way[highway];
  nwr[railway];
  nwr[aeroway];
  nwr[name];
  nwr[ref];
  nwr[military];
  nwr[landuse~"^(industrial|military)$"];
  nwr[man_made~"^(works|telescope|communications_tower)$"];
);
out body geom;

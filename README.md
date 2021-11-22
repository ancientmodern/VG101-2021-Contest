# Rules
- One Player One Tank
- Tank can move one block each turn
- Tank can choose to move left, right or straightly each turn
- Tank will shoot a bullet each turn
- Bullet will move straightly each two rounds
- Tank have 5 life points
- Once a tank is hit by a bullet, one life point will be deducted
- The map will shrink by 1 block each 4 turns
- Once a tank is outside of the map, one life point will be deducted
- The tank whose life points are totally deducted will lose
- When two tanks crash they will both lose
- Calculation will take place after two tanks move one turn

# stdin
Start:
0 0 <---- Start Position
0 0 <---- Opponent's Position
2 0 <---- Initial Directions
0 <---- Opponent's Move
...

# stdout
0 <---- Keep Going
1 <---- Left
2 <---- Right

# Ranking
If someone wins
BonusToWinner = base * multiplier^(scoreLose - scoreWin)
Else
BonusToScoreHigher = base * (multiplier^(scoreOpp - scoreSelf) - 1)


# Data Structure
## Compiler
User, compiler, time, source, status, stack, stdout, stderr, bin

## Competition Result
winner (-1, 0, 1), Error

## Match
status, p1, p2, winner, error, record

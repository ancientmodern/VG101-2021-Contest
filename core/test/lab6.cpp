#include <iostream>
#include <vector>

#include "lab6.h"
/***
 * For this LAB, you just need to change this file.
 * To finish Objective I, you should implement the functions in MyGame class
 * To finish Objective II, you should give interface to your MyBrain class and
 * complete your judge function based on your MyGame class.
 */

using namespace std;

// Create Your Data Structure Here
class Bullet {
 public:
  int x, y;
  Direction dir;

 public:
  Bullet(int xi, int yi, Direction direction) : x(xi), y(yi), dir(direction) {}
};

class MyGame : public Game {
  // Create Your Data Structure Here
 public:
  Vector2<int> vecA, vecB;
  Direction directionA, directionB;
  int lifeA = 5, lifeB = 5;
  int turnnum = 1;
  int boolnuma = 0, boolnumb = 0;
  int length = 10;
  vector<Bullet> bulletA, bulletB;

 public:
  /**
   * @param A_X The X position for P1
   * @param A_Y The Y position for P1
   * @param B_X The X position for P2
   * @param B_Y The Y position for P2
   * @param A_direction The direction for P1
   * @param B_direction The direction for P2
   * To know the definition of Direction type, you can look at `lab6.h`
   * D_Left (0) -> Towards negative X
   * D_Up (1) -> Towards negative y
   * D_Right (2) -> Towards positive X
   * D_Down (3) -> Towards positive Y
   */
  void initialize(int A_X, int A_Y, int B_X, int B_Y, Direction A_direction,
                  Direction B_direction) override {
    vecA.x = A_X;
    vecA.y = A_Y;
    vecB.x = B_X;
    vecB.y = B_Y;
    directionA = A_direction;
    directionB = B_direction;
  }

  /**
   * @param tank The tank that is to move
   * Tank_A (0) -> P1
   * Tank_B (1) -> P2
   * @param move The move it wants to take
   * M_Straight (0) -> Go straightly
   * M_Left (1) -> Turn Left
   * M_Right (2) -> Turn Right
   */
  void move(Tank tank, Move move) override {
    // Record A Move And Update Your Game
    // 1. Move
    // 2. Shoot
    if (tank == 0) {
      if ((move == 0 && directionA == 0) || (move == 1 && directionA == 1) ||
          (move == 2 && directionA == 3)) {
        vecA.x--;
        directionA = D_Left;
      } else if ((move == 0 && directionA == 1) ||
                 (move == 1 && directionA == 2) ||
                 (move == 2 && directionA == 0)) {
        vecA.y--;
        directionA = D_Up;
      } else if ((move == 0 && directionA == 2) ||
                 (move == 1 && directionA == 3) ||
                 (move == 2 && directionA == 1)) {
        vecA.x++;
        directionA = D_Right;
      } else {
        vecA.y++;
        directionA = D_Down;
      }
      if (turnnum % 3 == 1) {
        Bullet bullA(vecA.x, vecA.y, directionA);
        if (directionA == 0)
          bullA.x--;  // create bullet
        else if (directionA == 1)
          bullA.y--;
        else if (directionA == 2)
          bullA.x++;
        else {
          bullA.y++;
        }
        boolnuma += 1;
        bulletA.push_back(bullA);
      }
    } else {
      if ((move == 0 && directionB == 0) || (move == 1 && directionB == 1) ||
          (move == 2 && directionB == 3)) {
        vecB.x--;
        directionB = D_Left;
      } else if ((move == 0 && directionB == 1) ||
                 (move == 1 && directionB == 2) ||
                 (move == 2 && directionB == 0)) {
        vecB.y--;
        directionB = D_Up;
      } else if ((move == 0 && directionB == 2) ||
                 (move == 1 && directionB == 3) ||
                 (move == 2 && directionB == 1)) {
        vecB.x++;
        directionB = D_Right;
      } else {
        vecB.y++;
        directionB = D_Down;
      }
      if (turnnum % 3 == 1) {
        Bullet bullB(vecB.x, vecB.y, directionB);
        if (directionB == 0)
          bullB.x--;  // create bullet
        else if (directionB == 1)
          bullB.y--;
        else if (directionB == 2)
          bullB.x++;
        else {
          bullB.y++;
        }
        boolnumb += 1;
        bulletB.push_back(bullB);
      }
    }
  }

  /**
   * Calculate the result at the end of the turn. It will be called after two
   * tanks makes their move.
   * @return
   * T_Cont (0) -> Game continues
   * T_A_Win (1) -> P1 Wins
   * T_B_Win (2) -> P2 Wins
   * T_Draw (3) -> Draw
   */
  Turn turn() override {
    // Make Your Turn Here
    // 0. Tank Crash
    // 1. Move Bullets
    // 2. Out of Boundary
    // 3. Win or Lose
    turnnum += 1;
    if (vecA.x == vecB.x && vecA.y == vecB.y) {
      if (lifeA == lifeB)
        return T_Draw;
      else if (lifeA < lifeB)
        return T_B_Win;
      else
        return T_A_Win;
    }  // 0. Tank Crash
    // move bullets
    for (int i = 0; i < boolnumb; i++) {  // 1.bullet shot on target?
      if (vecA.x == bulletB[i].x && vecA.y == bulletB[i].y) {
        lifeA -= 2;
        bulletB.erase(bulletB.begin() + i);
        boolnumb--;
      }
    }
    for (int i = 0; i < boolnuma; i++) {  // 1.bullet shot on target?
      if (vecB.x == bulletA[i].x && vecB.y == bulletA[i].y) {
        lifeB -= 2;
        bulletA.erase(bulletA.begin() + i);
        boolnuma--;
      }
    }
    for (int i = 0; i < boolnuma; i++) {
      if (bulletA[i].dir == 0)
        bulletA[i].x -= 1;
      else if (bulletA[i].dir == 1)
        bulletA[i].y -= 1;
      else if (bulletA[i].dir == 2)
        bulletA[i].x += 1;
      else
        bulletA[i].y += 1;
    }
    for (int i = 0; i < boolnumb; i++) {
      if (bulletB[i].dir == 0)
        bulletB[i].x -= 1;
      else if (bulletB[i].dir == 1)
        bulletB[i].y -= 1;
      else if (bulletB[i].dir == 2)
        bulletB[i].x += 1;
      else
        bulletB[i].y += 1;
    }
    for (int i = 0; i < boolnumb; i++) {  // 1.bullet shot on target?
      if (vecA.x == bulletB[i].x && vecA.y == bulletB[i].y) {
        lifeA -= 2;
        bulletB.erase(bulletB.begin() + i);
        boolnumb--;
      }
    }
    for (int i = 0; i < boolnuma; i++) {  // 1.bullet shot on target?
      if (vecB.x == bulletA[i].x && vecB.y == bulletA[i].y) {
        lifeB -= 2;
        bulletA.erase(bulletA.begin() + i);
        boolnuma--;
      }
    }
    for (int i = 0; i < boolnuma; i++) {
      if (bulletA[i].dir == 0)
        bulletA[i].x -= 1;
      else if (bulletA[i].dir == 1)
        bulletA[i].y -= 1;
      else if (bulletA[i].dir == 2)
        bulletA[i].x += 1;
      else
        bulletA[i].y += 1;
    }
    for (int i = 0; i < boolnumb; i++) {
      if (bulletB[i].dir == 0)
        bulletB[i].x -= 1;
      else if (bulletB[i].dir == 1)
        bulletB[i].y -= 1;
      else if (bulletB[i].dir == 2)
        bulletB[i].x += 1;
      else
        bulletB[i].y += 1;
    }
    for (int i = 0; i < boolnumb; i++) {  // 1.bullet shot on target?
      if (vecA.x == bulletB[i].x && vecA.y == bulletB[i].y) {
        lifeA -= 2;
        bulletB.erase(bulletB.begin() + i);
        boolnumb--;
      }
    }
    for (int i = 0; i < boolnuma; i++) {  // 1.bullet shot on target?
      if (vecB.x == bulletA[i].x && vecB.y == bulletA[i].y) {
        lifeB -= 2;
        bulletA.erase(bulletA.begin() + i);
        boolnuma--;
      }
    }
    if ((turnnum - 1) % 16 == 0 && turnnum != 1)
      length--;  // what if boundary<=0?
    if (vecA.x < 10 - length || vecA.y < 10 - length || vecA.x > 9 + length ||
        vecA.y > 9 + length)
      lifeA--;
    if (vecB.x < 10 - length || vecB.y < 10 - length || vecB.x > 9 + length ||
        vecB.y > 9 + length)
      lifeB--;  // out of boundary
    if (lifeA <= 0 && lifeB > 0) return T_B_Win;
    if (lifeB <= 0 && lifeA > 0) return T_A_Win;
    if (lifeA <= 0 && lifeB <= 0) return T_Draw;
    return T_Cont;
  }
  void moveoppbullet() { /**this only move one*/
    for (int i = 0; i < boolnumb; i++) {
      if (bulletB[i].dir == 0)
        bulletB[i].x -= 1;
      else if (bulletB[i].dir == 1)
        bulletB[i].y -= 1;
      else if (bulletB[i].dir == 2)
        bulletB[i].x += 1;
      else
        bulletB[i].y += 1; /**do the judgement 3 times*/
    }
  }
  void movemytank(int i) {
    if ((Move(i) == 0 && directionA == 0) ||
        (Move(i) == 1 && directionA == 1) ||
        (Move(i) == 2 && directionA == 3)) {
      vecA.x--;
      directionA = D_Left;
    } else if ((Move(i) == 0 && directionA == 1) ||
               (Move(i) == 1 && directionA == 2) ||
               (Move(i) == 2 && directionA == 0)) {
      vecA.y--;
      directionA = D_Up;
    } else if ((Move(i) == 0 && directionA == 2) ||
               (Move(i) == 1 && directionA == 3) ||
               (Move(i) == 2 && directionA == 1)) {
      vecA.x++;
      directionA = D_Right;
    } else {
      vecA.y++;
      directionA = D_Down;
    }
  }

  /**
   * Draw the battlefield
   * @return
   */
  string draw() const override {
    char pan[30][30];
    for (int i = 0; i < 30; i++) {
      for (int j = 0; j < 30; j++) {
        pan[i][j] = '1';
      }
    }
    for (int i = -length + 15; i < 15 + length; i++) {
      for (int j = -length + 15; j < 15 + length; j++) {
        pan[i][j] = '_';
      }
    }

    if (directionA == 0)
      pan[vecA.y + 5][vecA.x + 5] = '<';
    else if (directionA == 1)
      pan[vecA.y + 5][vecA.x + 5] = '^';
    else if (directionA == 2)
      pan[vecA.y + 5][vecA.x + 5] = '>';
    else
      pan[vecA.y + 5][vecA.x + 5] = 'v';

    if (directionB == 0)
      pan[vecB.y + 5][vecB.x + 5] = '<';
    else if (directionB == 1)
      pan[vecB.y + 5][vecB.x + 5] = '^';
    else if (directionB == 2)
      pan[vecB.y + 5][vecB.x + 5] = '>';
    else
      pan[vecB.y + 5][vecB.x + 5] = 'v';

    for (int i = 0; i < boolnuma; i++) {
      if (-5 <= bulletA[i].x && bulletA[i].x < 25 && bulletA[i].y >= -5 &&
          bulletA[i].y < 25)
        pan[bulletA[i].y + 5][bulletA[i].x + 5] = '.';
    }
    for (int i = 0; i < boolnumb; i++) {
      if (-5 <= bulletB[i].x && bulletB[i].x < 25 && bulletB[i].y >= -5 &&
          bulletB[i].y < 25)
        pan[bulletB[i].y + 5][bulletB[i].x + 5] = '.';
    }
    string string1;
    for (int i = 0; i < 30; i++) {
      for (int j = 0; j < 30; j++) {
        string1.push_back(pan[i][j]);
      }
      string1.append("\n");
    }
    cout << "A life=" << lifeA << " ;B life=" << lifeB
         << " ;turn=" << turnnum - 1 << endl;

    return string1;
  }
};

class MyBrain : public Brain {
  // Create Your Status Variables Here
  double rank[3];
  const MyGame* game = nullptr;

 public:
  void initialize() override {
    // Initialize Your AI here
    rank[0] = rank[1] = rank[2] = 10;
    // why you put it outside
    game = dynamic_cast<MyGame*>(
        getMyGame());  // This will give you a MyGame pointer from the Game
                       // pointer returned by getMyGame() So you can access the
                       // variable before it's declared.
  }

  Move judge() override {
    // Move Your Move Here

    for (int i = 0; i < 3; i++) {
      rank[i] = 10;
      MyGame test = *game;
      // test=*game;//can I create a new MyGame object by assigning? pure copy
      // constructor(default)
      test.movemytank(i);
      for (int j = 0; j < test.boolnumb; j++) {  // 1.bullet shot on target?
        if ((test.vecA.x == test.bulletB[i].x) &&
            (test.vecA.y == test.bulletB[i].y)) {
          rank[i] -= 2;
        }
      }
      test.moveoppbullet();
      for (int j = 0; j < test.boolnumb; j++) {  // 1.bullet shot on target?
        if ((test.vecA.x == test.bulletB[i].x) &&
            (test.vecA.y == test.bulletB[i].y)) {
          rank[i] -= 2;
        }
      }
      test.moveoppbullet();
      for (int j = 0; j < test.boolnumb; j++) {  // 1.bullet shot on target?
        if ((test.vecA.x == test.bulletB[i].x) &&
            (test.vecA.y == test.bulletB[i].y)) {
          rank[i] -= 2;
        }
      }
      if ((test.vecA.x == 10 - test.length) ||
          (test.vecA.y == 10 - test.length) ||
          (test.vecA.x == 9 + test.length) ||
          (test.vecA.y == 9 + test.length)) {
        rank[i]--;
      }
      if ((test.vecA.x < 10 - test.length) ||
          (test.vecA.y < 10 - test.length) || (test.vecA.x > 9 + test.length) ||
          (test.vecA.y > 9 + test.length)) {
        rank[i] -= 2;
      }
      // if(vecA.x<10-length||vecA.y<10-length||vecA.x>9+length||vecA.y>9+length)lifeA--;
    }
    // cout<<"rank 0="<<rank[0]<<" rank 1="<<rank[1]<<" rank 2="<<rank[2]<<endl;
    if ((rank[0] >= rank[1]) && (rank[0] >= rank[2]))
      return M_Straight;
    else if ((rank[1] >= rank[0]) && (rank[1] >= rank[2]))
      return Move(1);
    else
      return Move(2);
  }
};

static MyGame game;
static MyBrain brain;

Game* getMyGame() { return &game; }

Brain* getMyBrain() { return &brain; }

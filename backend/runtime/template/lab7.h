#ifndef LAB6_2_LAB6_H
#define LAB6_2_LAB6_H

#include <string>
#include <cmath>

#define MAP_SIZE 20

template <typename B = int>
struct Vector2 {
    B x, y;

    Vector2(B _x = 0, B _y = 0) : x(_x), y(_y) {}

    Vector2<B> operator+(const Vector2<B> &another) const { return {x + another.x, y + another.y}; }
    Vector2<B> operator-(const Vector2<B> &another) const { return {x - another.x, y - another.y}; }
    Vector2<B> operator*(B multiplier) const { return {x * multiplier, y * multiplier}; }
    Vector2<B> operator/(B multiplier) const { return {x / multiplier, y / multiplier}; }

    Vector2<B> operator+=(const Vector2<B> &another) { x += another.x; y += another.y; return *this;}
    Vector2<B> operator-=(const Vector2<B> &another) { x -= another.x; y -= another.y; return *this;}
    Vector2<B> operator*=(B multiplier) { x *= multiplier; y *= multiplier; return *this;}
    Vector2<B> operator/=(B multiplier) { x /= multiplier; y /= multiplier; return *this;}

    bool operator==(const Vector2<B> &another) const { return x == another.x && y == another.y; }

    double length() const { return sqrt(double(x * x + y * y));}
};

enum Tank {
    Tank_A, Tank_B
};

enum Direction {
    D_Left, D_Up, D_Right, D_Down
};

enum Move {
    M_Straight, M_Left, M_Right
};

enum Turn {
    T_Cont, T_A_Win, T_B_Win, T_Draw
};

enum Block {
    B_Blank, B_Bullet, B_Tank_A, B_Tank_B
};

struct Map {
    Block block[MAP_SIZE + 10][MAP_SIZE + 10];
    int border;
};

class Game {
public:
    virtual void initialize(int A_X, int A_Y, int B_X, int B_Y, Direction A_direction, Direction B_direction) = 0;
    virtual void move(Tank tank, Move move) = 0;
    virtual Turn turn() = 0;
    virtual std::string draw() const = 0;

    virtual Map getMap() const { return {}; }
    virtual void moveTank(Tank tank, const Vector2<> &pos, Direction direction) {};
    virtual void addBullet(const Vector2<> &pos, Direction direction) {};
    virtual void setBorder(int border) {};
};

class Brain {
public:
    virtual void initialize() = 0;
    virtual Move judge() = 0;
};

Game *getMyGame();
Brain *getMyBrain();

#endif //LAB6_2_LAB6_H

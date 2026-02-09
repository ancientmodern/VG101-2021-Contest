#include <iostream>
#include <string>
#include "lab6.h"

using namespace std;

int main(int argc, char *argv[]) {
    if (argc == 2 && string(argv[1]) == "-r") {
        Game &game = *getMyGame();
        Brain &brain = *getMyBrain();

        int myX, myY, oppX, oppY;
        cin >> myX >> myY;
        cin >> oppX >> oppY;

        int myD, oppD;
        cin >> myD >> oppD;

        game.initialize(myX, myY, oppX, oppY, Direction(myD), Direction(oppD));
        brain.initialize();

        do {
            Move m = brain.judge();
            cout << int(m) << endl;

            int oppMove;
            cin >> oppMove;

            game.move(Tank_A, m);
            game.move(Tank_B, Move(oppMove));
        } while (game.turn() == T_Cont);
    } else {
        // Do Your Testing Here
    }
    return 0;
}

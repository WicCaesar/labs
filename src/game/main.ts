import { Game as MainGame } from './scenes/Game';
import { IsometricDungeon } from './scenes/IsometricDungeon';
import { AUTO, Game, Scale,Types } from 'phaser';
import type { SceneKey } from '../shared/constants/sceneKeys';
import { SCENE_KEYS } from '../shared/constants/sceneKeys';

// Find out more information about the Game Config at:
// https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    }
};

const StartGame = (parent: string, startScene: SceneKey = SCENE_KEYS.QUIZ_GAME) => {
    const orderedScenes = startScene === SCENE_KEYS.ISOMETRIC_DUNGEON
        ? [IsometricDungeon, MainGame]
        : [MainGame, IsometricDungeon];

    return new Game({ ...config, parent, scene: orderedScenes });
}

export default StartGame;

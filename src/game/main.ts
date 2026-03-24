import { Game as MainGame } from './scenes/Game';
import { IsometricDungeon } from './scenes/IsometricDungeon';
import { MainScreen } from './scenes/MainScreen';
import { RankScreen } from './scenes/RankScreen';
import { DeathScreen } from './scenes/DeathScreen';
import { PowerUpScreen } from './scenes/PowerUpScreen';
import { AUTO, Game, Scale,Types } from 'phaser';

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

const StartGame = (parent: string) => {
    const orderedScenes = [MainScreen, MainGame, IsometricDungeon, RankScreen, DeathScreen, PowerUpScreen];

    return new Game({ ...config, parent, scene: orderedScenes });
}

export default StartGame;

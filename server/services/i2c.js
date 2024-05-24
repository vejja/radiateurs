import { openSync } from 'i2c-bus'
import log from './logger.js'

/**
 * @typedef { Array<number> } PhaseCommands
 */

/**
 * Classe pour contrôler les modules I2C
 */
class I2CController {
  IODIRA = 0x00	// Direction du port A (input/output)
  IODIRB = 0x01	// Direction du port B (input/output)
  GPIOA = 0x12   // Adresse du port A en mode input
  GPIOB = 0x13   // Adresse du port B en mode input
  OLATA = 0x14	// Adresse du port A en mode output
  OLATB = 0x15	// Adresse du port B en mode output
  /** @type { ReturnType<openSync>} */
  i2cBus

  constructor() {
    this.i2cBus = openSync(1)
    // Initialise les ports A et B de chaque module en mode output
    for (let phase = 1; phase <= 3; phase++) {
      const device = this.getModuleAddress(phase - 1)
      this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
      this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    }
  }
  /**
   * Renvoie l'adresse binaire du module I2C sur lequel communiquer
   * @param { number } numModule le numero 0, 1 ou 2
   */
  getModuleAddress(numModule) {
    if (numModule < 0b000 || numModule > 0b010) {
      throw new Error('Module number must be 0, 1 or 2')
    }
    // L'adresse du MCP23017 est construite sur 7 bits : 0 1 0 0 A2 A1 A0
    // Le numero de module est egal à son adresse en binaire : A2 A1 A0
    // Par exemple 0x20 pour 000, 0x21 pour 001, Ox22 pour 010, etc...
    // Il suffit donc de faire un bitwise OR de 0 1 0 0 0 0 0 et de A2 A1 A0
    // (Attention sur la carte pilote j'ai inversé, A0 est à gauche et A2 à droite
    // quand les connecteurs I2C sont en haut sur le rail)
    return (0b010_0000 | numModule)
  }

  /**
   * Récupère l'état des 8 radiateurs sur une phase donnée
   * @param { number } phase le numéro de phase (1, 2 ou 3)
   * @returns Renvoie un array de 8 valeurs, chacune d'entre elles peut être ARRET, MARCHE, ECO ou HORSGEL
   */
  readStates(phase) {
    const device = this.getModuleAddress(phase - 1)

    // Toutes les broches sont utilisées en output sur le port A et sur le port B
    // Lit les valeurs préexistantes sur le port A et sur le port B
    this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
    let portA = this.i2cBus.readByteSync(device, this.GPIOA)
    this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    let portB = this.i2cBus.readByteSync(device, this.GPIOB)
		
    const commandsA = []
    const commandsB = []

    for (let i=0; i<4; i++) {
      // Lit les 2 derniers bits sur chaque port
      const commandA = portA & 0b0000_0011
      const commandB = portB & 0b0000_0011

      // Enregistre la commande dans l'array
      commandsA.push(commandA)
      commandsB.push(commandB)

      // Décale les valeurs des registres de 2 bits vers la droite
      portA >>= 2
      portB >>= 2
    }

    // Colle les 2 arrays et retourne le résultat
    const wires = [...commandsA, ...commandsB]
    log.debug('read phase #' + phase + ' and wires ' + wires + ': device = ' + device + '; portA = ' + portA + ', portB = ' + portB)
    return wires
  }

  /**
   * Change l'état des fils pilotes
   * @param { number } phase la phase à modifier
   * @param { PhaseCommands } wires un array avec 8 valeurs, chacune d'entre elles peut être MARCHE, ARRET, ECO ou HORSGEL
  */
  writeStates(phase, wires) {
    const device = this.getModuleAddress(phase - 1)

    let portA = 0b00
    let portB = 0b00

    for (let i=3; i>=0; i--) {
      // Lit les commandes à inscrire sur chaque port en commençant par les fils les plus hauts
      const commandA = wires[i]
      const commandB = wires[i+4]

      // Décale les valeurs des registres de 2 bits vers la gauche
      portA <<= 2
      portB <<= 2

      // Enregistre la nouvelle commande dans les 2 bits les plus à droite
      portA |= commandA
      portB |= commandB
    }

    // Modifie les valeurs sur le port A et sur le port B
    log.debug('write phase #' + phase + ' with wires ' + wires + ' : device = ' + device + '; port A = ' + portA + ', port B = ' + portB)
    this.i2cBus.writeByteSync(device, this.IODIRA, 0b0000_0000)
    this.i2cBus.writeByteSync(device, this.OLATA, portA)
    this.i2cBus.writeByteSync(device, this.IODIRB, 0b0000_0000)
    this.i2cBus.writeByteSync(device, this.OLATB, portB)
  }

}

export default I2CController
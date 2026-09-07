// CIVILIZATION.JS - ADVANCED ACTIONS & SIDE EVENTS
// This file loads automatically after Turn 15
// Contains 15+ advanced buildings + random side activities

const advancedActions = [
    {
        id: 'nuclear_plant',
        name: 'Nuclear Plant',
        desc: 'Massive energy, meltdown risk',
        cost: 'Money -50',
        effect: () => {
            resources.money -= 50;
            resources.energy += 100;
            resources.pollution += 15;
            // Hidden: 20% meltdown chance in 20 turns
            pendingEvents.push({
                turn: turn + 20,
                effect: () => {
                    if(Math.random() > 0.8){
                        resources.population -= 100;
                        resources.health -= 80;
                        resources.happiness -= 50;
                        logEvent('☢️ NUCLEAR MELTDOWN! Catastrophe!', 'warning');
                        speak('Nuclear meltdown detected. Evacuate immediately.');
                    } else {
                        logEvent('Nuclear plant operating safely', 'success');
                    }
                }
            });
        }
    },
    {
        id: 'ai_research_lab',
        name: 'AI Research Lab',
        desc: 'Exponential knowledge growth',
        cost: 'Money -40, Knowledge 50+',
        effect: () => {
            if(resources.knowledge >= 50){
                resources.money -= 40;
                // Knowledge doubles every 3 turns for 15 turns
                for(let i = 1; i <= 5; i++){
                    pendingEvents.push({
                        turn: turn + i*3,
                        effect: () => {
                            const gain = Math.floor(resources.knowledge * 0.5);
                            resources.knowledge += gain;
                            lastChange.knowledge += gain;
                            logEvent(`AI breakthrough! Knowledge +${gain}`, 'success');
                        }
                    });
                }
            } else {
                showMsg('Need 50+ Knowledge to build AI Lab!');
                turn--; // Refund turn
            }
        }
    },
    {
        id: 'space_program',
        name: 'Space Program',
        desc: 'Unlock new resources',
        cost: 'Money -80, Energy -30',
        effect: () => {
            resources.money -= 80;
            resources.energy -= 30;
            // Hidden: Asteroid mining in 12 turns
            pendingEvents.push({
                turn: turn + 12,
                effect: () => {
                    resources.money += 150;
                    resources.energy += 80;
                    logEvent('🚀 Asteroid mining successful! Massive resources!', 'success');
                    speak('Space mining operation returned with vast resources.');
                }
            });
        }
    },
    {
        id: 'climate_control',
        name: 'Climate Control System',
        desc: 'Eliminate pollution',
        cost: 'Money -60, Energy -20',
        effect: () => {
            resources.money -= 60;
            resources.energy -= 20;
            resources.pollution = Math.max(0, resources.pollution - 40);
            resources.health += 30;
            lastChange.pollution -= 40;
            lastChange.health += 30;
            logEvent('Climate system cleaned the atmosphere', 'success');
        }
    },
    {
        id: 'genetic_lab',
        name: 'Genetic Research Lab',
        desc: 'Cure diseases, boost health',
        cost: 'Money -45, Knowledge 40+',
        effect: () => {
            if(resources.knowledge >= 40){
                resources.money -= 45;
                resources.health += 40;
                resources.happiness += 15;
                // Hidden: Immunity in 8 turns
                pendingEvents.push({
                    turn: turn + 8,
                    effect: () => {
                        logEvent('Genetic immunity developed. Disease immunity active!', 'success');
                        // Prevent next 3 disease events
                        window.diseaseImmunity = 3;
                    }
                });
            } else {
                showMsg('Need 40+ Knowledge first!');
                turn--;
            }
        }
    },
    {
        id: 'quantum_computer',
        name: 'Quantum Computer',
        desc: 'Optimize all systems',
        cost: 'Money -70, Energy -25',
        effect: () => {
            resources.money -= 70;
            resources.energy -= 25;
            // Hidden: 10% efficiency boost to everything in 5 turns
            pendingEvents.push({
                turn: turn + 5,
                effect: () => {
                    resources.food = Math.floor(resources.food * 1.1);
                    resources.energy = Math.floor(resources.energy * 1.1);
                    resources.money = Math.floor(resources.money * 1.1);
                    logEvent('Quantum optimization: +10% efficiency all resources', 'success');
                }
            });
        }
    },
    {
        id: 'fusion_reactor',
        name: 'Fusion Reactor',
        desc: 'Clean unlimited energy',
        cost: 'Money -100, Knowledge 60+',
        effect: () => {
            if(resources.knowledge >= 60){
                resources.money -= 100;
                resources.energy += 200;
                // No pollution unlike nuclear
                logEvent('Fusion reactor online! Clean unlimited energy!', 'success');
                speak('Fusion energy achieved. Clean power for all.');
            } else {
                showMsg('Need 60+ Knowledge for fusion!');
                turn--;
            }
        }
    },
    {
        id: 'hydroponic_farms',
        name: 'Hydroponic Mega Farms',
        desc: 'Food independent of weather',
        cost: 'Money -55, Energy -15',
        effect: () => {
            resources.money -= 55;
            resources.energy -= 15;
            resources.food += 80;
            // Hidden: Drought immunity
            pendingEvents.push({
                turn: turn + 10,
                effect: () => {
                    logEvent('Hydroponic farms immune to drought events', 'success');
                    window.droughtImmunity = true;
                }
            });
        }
    },
    {
        id: 'robotic_factory',
        name: 'Robotic Factory',
        desc: 'Money with no pollution',
        cost: 'Money -65, Knowledge 45+',
        effect: () => {
            if(resources.knowledge >= 45){
                resources.money -= 65;
                resources.money += 50; // Net +50 income
                // No pollution penalty
                logEvent('Robotic factory built. Clean industrial production.', 'success');
            } else {
                showMsg('Need 45+ Knowledge for robotics!');
                turn--;
            }
        }
    },
    {
        id: 'wonder_project',
        name: 'Civilization Wonder',
        desc: 'Massive happiness boost',
        cost: 'Money -120',
        effect: () => {
            resources.money -= 120;
            resources.happiness += 100;
            // Hidden: Attracts immigrants in 6 turns
            pendingEvents.push({
                turn: turn + 6,
                effect: () => {
                    resources.population += 80;
                    logEvent('Wonder attracted migrants from other lands!', 'success');
                }
            });
        }
    },
    {
        id: 'terraforming',
        name: 'Terraforming Project',
        desc: 'Make land more fertile',
        cost: 'Money -90, Energy -40',
        effect: () => {
            resources.money -= 90;
            resources.energy -= 40;
            // Permanent +20% food production
            pendingEvents.push({
                turn: turn + 15,
                effect: () => {
                    logEvent('Terraforming complete! Land 20% more fertile forever', 'success');
                    // Modify future farm outputs
                    window.terraformBonus = 1.2;
                }
            });
        }
    },
    {
        id: 'cryo_storage',
        name: 'Cryogenic Storage',
        desc: 'Preserve population during crisis',
        cost: 'Money -75',
        effect: () => {
            resources.money -= 75;
            // Hidden: Save 50% population if disaster hits
            pendingEvents.push({
                turn: turn + 20,
                effect: () => {
                    logEvent('Cryo storage ready. Population protection active.', 'success');
                    window.cryoProtection = true;
                }
            });
        }
    },
    {
        id: 'teleport_network',
        name: 'Teleport Network',
        desc: 'Zero energy transport',
        cost: 'Money -110, Knowledge 70+',
        effect: () => {
            if(resources.knowledge >= 70){
                resources.money -= 110;
                resources.energy += 50; // Saves energy
                resources.happiness += 20;
                logEvent('Teleport network eliminates transport energy cost!', 'success');
            } else {
                showMsg('Need 70+ Knowledge for teleportation!');
                turn--;
            }
        }
    },
    {
        id: 'orbital_defense',
        name: 'Orbital Defense Platform',
        desc: 'Protection from space threats',
        cost: 'Money -130',
        effect: () => {
            resources.money -= 130;
            // Hidden: Prevents asteroid/comet disasters
            pendingEvents.push({
                turn: turn + 25,
                effect: () => {
                    logEvent('Orbital defense destroyed incoming asteroid!', 'success');
                    speak('Asteroid threat neutralized by orbital defenses.');
                }
            });
        }
    },
    {
        id: 'singularity_core',
        name: 'Singularity Core',
        desc: 'Win condition technology',
        cost: 'Money -200, Knowledge 100+',
        effect: () => {
            if(resources.knowledge >= 100 && resources.money >= 200){
                resources.money -= 200;
                // Win the game in 10 turns if civilization survives
                pendingEvents.push({
                    turn: turn + 10,
                    effect: () => {
                        if(resources.population > 0 && resources.health > 30){
                            logEvent('🏆 SINGULARITY ACHIEVED! You transcend!', 'success');
                            showMsg('VICTORY! Technological Singularity Reached!');
                            speak(`Ruler ${rulerName}, you have achieved technological singularity. Your civilization transcends.`);
                            clearInterval(timer);
                        }
                    }
                });
                logEvent('Singularity core construction started...', 'success');
            } else {
                showMsg('Need 100+ Knowledge and 200 Money!');
                turn--;
            }
        }
    }
];

// SIDE EVENTS - Random activities that trigger between turns
const sideEvents = [
    {
        name: 'Meteor Shower',
        chance: 0.05,
        effect: () => {
            if(!window.orbitalDefense){
                resources.energy -= 30;
                logEvent('METEOR SHOWER: Energy grid damaged -30', 'warning');
            }
        }
    },
    {
        name: 'Migration Wave',
        chance: 0.08,
        effect: () => {
            if(resources.happiness > 80){
                resources.population += 40;
                logEvent('MIGRATION: High happiness attracted 40 people', 'success');
            }
        }
    },
    {
        name: 'Solar Flare',
        chance: 0.06,
        effect: () => {
            resources.energy -= 20;
            logEvent('SOLAR FLARE: Energy systems disrupted -20', 'warning');
        }
    },
    {
        name: 'Cultural Renaissance',
        chance: 0.07,
        effect: () => {
            if(resources.knowledge > 60){
                resources.happiness += 25;
                resources.knowledge += 15;
                logEvent('CULTURAL RENAISSANCE: Art and science boom!', 'success');
            }
        }
    },
    {
        name: 'Trade Caravan',
        chance: 0.1,
        effect: () => {
            resources.money += 30;
            resources.food += 15;
            logEvent('TRADE CARAVAN: +30 money, +15 food', 'success');
        }
    },
    {
        name: 'Volcanic Eruption',
        chance: 0.04,
        effect: () => {
            resources.population -= 25;
            resources.food -= 20;
            logEvent('VOLCANO: Land destroyed, -25 population', 'warning');
        }
    },
    {
        name: 'Ancient Artifact Found',
        chance: 0.05,
        effect: () => {
            resources.knowledge += 35;
            logEvent('ARTIFACT: Ancient knowledge discovered +35', 'success');
        }
    },
    {
        name: 'Plague Immunity',
        chance: 0.03,
        effect: () => {
            if(resources.health > 70){
                logEvent('IMMUNITY: Population developed disease resistance', 'success');
                window.plagueResistance = true;
            }
        }
    },
    {
        name: 'Comet Mining',
        chance: 0.04,
        effect: () => {
            if(turn > 20){
                resources.money += 100;
                logEvent('COMET MINING: Rare metals worth 100 money!', 'success');
            }
        }
    },
    {
        name: 'Philosopher Emerges',
        chance: 0.06,
        effect: () => {
            resources.happiness += 15;
            resources.knowledge += 10;
            logEvent('PHILOSOPHER: Great thinker inspires society', 'success');
        }
    }
];

// OVERRIDE THE BASE GAME FUNCTIONS TO USE THESE
// This replaces the empty loadExternalJS function in your HTML

function loadExternalJS(){
    usingExternalJS = true;
    logEvent('Advanced technologies unlocked! 15 new buildings available', 'success');
    
    // Replace base actions with combined list
    window.baseActions = [...baseActions, ...advancedActions];
    
    // Add side event checker to nextTurn
    const originalNextTurn = window.nextTurn;
    window.nextTurn = function(){
        // Check for side events 10% chance each turn
        sideEvents.forEach(event => {
            if(Math.random() < event.chance){
                // Skip if immunity active
                if(event.name.includes('Disease') && window.diseaseImmunity > 0){
                    window.diseaseImmunity--;
                    return;
                }
                if(event.name === 'Drought' && window.droughtImmunity){
                    logEvent('Drought blocked by hydroponic farms', 'success');
                    return;
                }
                event.effect();
            }
        });
        
        // Call original nextTurn logic
        originalNextTurn();
    };
    
    showMsg('15 Advanced buildings + 10 Side events loaded!');
}
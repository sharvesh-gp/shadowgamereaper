import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Game.css';
import { saveScoreToCloud, fetchGlobalLeaderboard } from './utils/amplifyUtils';

const THEMES = {
  0: { name: 'Desert Wasteland', bg: '#D2B48C', cannonball: '#8B4513', trail: '#CD853F' },
  1: { name: 'Deep Space', bg: '#191970', cannonball: '#FFFFFF', trail: '#4169E1' },
  2: { name: 'Mystic Forest', bg: '#228B22', cannonball: '#8B4513', trail: '#32CD32' },
  3: { name: 'Frozen Tundra', bg: '#B0E0E6', cannonball: '#000080', trail: '#87CEEB' },
  4: { name: 'Volcanic Crater', bg: '#8B0000', cannonball: '#FF4500', trail: '#FF6347' },
  5: { name: 'Ocean Depths', bg: '#006994', cannonball: '#FFD700', trail: '#00CED1' }
};

const WEATHER = ['Clear', 'Rain', 'Fog', 'Wind'];

const Game = () => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [gameState, setGameState] = useState('MAIN_MENU');
  const [playerName, setPlayerName] = useState('');
  const [menuIndex, setMenuIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(10);
  const [accuracy, setAccuracy] = useState(100);
  const [shotsFired, setShotsFired] = useState(0);
  const [targetsHit, setTargetsHit] = useState(0);
  const [maxLevel, setMaxLevel] = useState(1);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [weather, setWeather] = useState('Clear');
  const [windStrength, setWindStrength] = useState(0);
  
  const gameDataRef = useRef({
    bullets: [],
    targets: [],
    particles: [],
    mouseX: 0,
    mouseY: 0,
    cannonAngle: 0,
    muzzleFlash: 0,
    crosshair: { x: 0, y: 0, sway: 0 },
    paused: false
  });

  const loadLeaderboard = useCallback(async () => {
    setIsLeaderboardLoading(true);
    try {
      // First try to load from global leaderboard
      const globalLeaderboard = await fetchGlobalLeaderboard(50);
      if (globalLeaderboard && globalLeaderboard.length > 0) {
        setLeaderboard(globalLeaderboard);
      } else {
        // Fall back to local storage if global fetch fails
        const saved = localStorage.getItem('shadowReaperLeaderboard');
        if (saved) {
          setLeaderboard(JSON.parse(saved));
        }
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      // Fall back to local storage
      const saved = localStorage.getItem('shadowReaperLeaderboard');
      if (saved) {
        setLeaderboard(JSON.parse(saved));
      }
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, []);

  const saveScore = useCallback(async (finalScore, finalLevel, finalAccuracy) => {
    const newEntry = {
      name: playerName,
      score: finalScore,
      maxLevel: finalLevel,
      accuracy: finalAccuracy,
      date: new Date().toLocaleDateString(),
      id: Date.now() + Math.random() // Unique identifier
    };
    
    // Save to global leaderboard
    try {
      await saveScoreToCloud(playerName, finalScore, finalLevel, finalAccuracy);
    } catch (error) {
      console.error('Error saving to global leaderboard:', error);
    }
    
    // Also save locally as backup
    const filteredLeaderboard = leaderboard.filter(entry => entry.name !== playerName);
    const updated = [...filteredLeaderboard, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    
    setLeaderboard(updated);
    localStorage.setItem('shadowReaperLeaderboard', JSON.stringify(updated));
    
    // Refresh leaderboard to get latest global scores
    loadLeaderboard();
  }, [leaderboard, playerName, loadLeaderboard]);

  const playSound = useCallback((type) => {
    if (!soundEnabled) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'gunshot') {
      oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  }, [soundEnabled, volume]);

  const createTarget = useCallback((x, y, type = 'static') => ({
    id: Math.random(),
    x, y,
    type,
    hit: false,
    moveSpeed: Math.max(0.5, 1 + Math.random() * Math.min(2, level * 0.3)),
    direction: Math.random() > 0.5 ? 1 : -1,
    originalX: x,
    originalY: y,
    range: Math.max(80, 120 - level * 5)
  }), [level]);

  const createBullet = useCallback((startX, startY, targetX, targetY) => {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 12;
    const gravity = 0.08;
    
    // Calculate trajectory with gravity compensation
    const time = distance / speed;
    const gravityDrop = 0.5 * gravity * time * time;
    
    const vx = dx / time;
    const vy = (dy / time) - (gravityDrop / time);
    
    // Enhanced wind effect
    const windEffect = windStrength * 0.1;
    const rainEffect = weather === 'Rain' ? Math.random() * 0.1 - 0.05 : 0;
    
    return {
      id: Math.random(),
      x: startX,
      y: startY,
      vx: vx + windEffect + rainEffect,
      vy: vy,
      trail: [],
      missed: false,
      hit: false,
      gravity: gravity
    };
  }, [windStrength, weather]);

  const initializeLevel = useCallback(() => {
    const data = gameDataRef.current;
    data.targets = [];
    data.bullets = [];
    data.particles = [];
    data.levelTransition = false;
    
    // Progressive difficulty - start easier
    const baseTargets = Math.min(2 + Math.floor(level / 3), 6);
    const targetCount = level === 1 ? 2 : baseTargets;
    const canvas = canvasRef.current;
    
    if (canvas) {
      for (let i = 0; i < targetCount; i++) {
        const x = 200 + Math.random() * (canvas.width - 400);
        const y = 80 + Math.random() * (canvas.height - 300);
        
        // Progressive target types - start with more static targets
        let type = 'static';
        if (level > 2) {
          const staticChance = Math.max(0.4, 0.8 - (level * 0.1));
          const rand = Math.random();
          if (rand > staticChance) {
            type = level > 4 ? ['horizontal', 'vertical'][Math.floor(Math.random() * 2)] : 'horizontal';
          }
        }
        
        data.targets.push(createTarget(x, y, type));
      }
    }
    
    // Progressive weather introduction
    if (level > 2) {
      const weatherChance = Math.min(0.7, (level - 2) * 0.15);
      if (Math.random() < weatherChance) {
        const availableWeather = level > 5 ? WEATHER : ['Clear', 'Rain', 'Wind'];
        const weatherType = availableWeather[Math.floor(Math.random() * availableWeather.length)];
        setWeather(weatherType);
        
        if (weatherType === 'Wind') {
          setWindStrength((Math.random() - 0.5) * Math.min(4, level * 0.5));
        } else {
          setWindStrength(0);
        }
      } else {
        setWeather('Clear');
        setWindStrength(0);
      }
    } else {
      setWeather('Clear');
      setWindStrength(0);
    }
  }, [level, createTarget]);

  const updateTargets = useCallback(() => {
    const data = gameDataRef.current;
    data.targets.forEach(target => {
      if (target.type === 'horizontal') {
        target.x += target.moveSpeed * target.direction;
        if (target.x > target.originalX + target.range || target.x < target.originalX - target.range) {
          target.direction *= -1;
        }
      } else if (target.type === 'vertical') {
        target.y += target.moveSpeed * target.direction;
        if (target.y > target.originalY + target.range || target.y < target.originalY - target.range) {
          target.direction *= -1;
        }
      }
    });
  }, []);

  const updateBullets = useCallback(() => {
    const data = gameDataRef.current;
    const canvas = canvasRef.current;
    
    if (!canvas) return;
    
    data.bullets.forEach((bullet, index) => {
      // Apply wind effect continuously
      if (weather === 'Wind') {
        bullet.vx += windStrength * 0.01;
      }
      
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      bullet.vy += bullet.gravity || 0.05; // gravity
      
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > 12) bullet.trail.shift();
      
      // Check target collision - larger hit area
      data.targets.forEach(target => {
        if (!target.hit && !bullet.hit) {
          const dx = bullet.x - target.x;
          const dy = bullet.y - target.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 45) {
            target.hit = true;
            bullet.hit = true;
            
            const centerDistance = Math.min(distance, 45);
            const baseScore = 100;
            const accuracyBonus = Math.floor((45 - centerDistance) / 45 * 100);
            const points = baseScore + accuracyBonus;
            
            setScore(prev => prev + points);
            setTargetsHit(prev => {
              const newHits = prev + 1;
              setAccuracy(Math.round((newHits / shotsFired) * 100) || 0);
              return newHits;
            });
            
            // Create particles
            for (let i = 0; i < 15; i++) {
              data.particles.push({
                x: target.x,
                y: target.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 40,
                maxLife: 40
              });
            }
          }
        }
      });
      
      // Check if bullet is off screen
      if (bullet.x < -50 || bullet.x > canvas.width + 50 || bullet.y < -50 || bullet.y > canvas.height + 50) {
        if (!bullet.hit && !bullet.missed) {
          bullet.missed = true;
          setLives(prev => {
            const newLives = prev - 1;
            if (newLives <= 0) {
              setTimeout(() => {
                setGameState('GAME_OVER');
                saveScore(score, level, Math.round((targetsHit / shotsFired) * 100) || 0);
              }, 100);
            }
            return newLives;
          });
        }
        data.bullets.splice(index, 1);
      }
    });
  }, [score, level, targetsHit, shotsFired, saveScore, weather, windStrength]);

  const updateParticles = useCallback(() => {
    const data = gameDataRef.current;
    data.particles.forEach((particle, index) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life--;
      
      if (particle.life <= 0) {
        data.particles.splice(index, 1);
      }
    });
  }, []);

  const checkLevelComplete = useCallback(() => {
    const data = gameDataRef.current;
    const allTargetsHit = data.targets.every(target => target.hit);
    
    if (allTargetsHit && data.targets.length > 0 && !data.levelTransition) {
      data.levelTransition = true;
      
      // Level completion bonus
      setScore(prev => prev + (level * 50));
      
      setTimeout(() => {
        setLevel(prev => {
          const newLevel = prev + 1;
          setMaxLevel(Math.max(maxLevel, newLevel));
          
          // Bonus life every 3 levels
          if (newLevel % 3 === 0) {
            setLives(prev => Math.min(prev + 1, 15));
          }
          
          return newLevel;
        });
        
        // Smooth transition
        setTimeout(() => {
          initializeLevel();
        }, 200);
      }, 800);
    }
  }, [maxLevel, initializeLevel, level]);

  const handleCanvasClick = useCallback((e) => {
    if (gameState !== 'PLAYING' || gameDataRef.current.paused || gameDataRef.current.levelTransition) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const cannonX = canvas.width / 2;
    const cannonY = canvas.height - 100;
    
    const bullet = createBullet(cannonX, cannonY, x, y);
    gameDataRef.current.bullets.push(bullet);
    gameDataRef.current.muzzleFlash = 15;
    
    setShotsFired(prev => {
      const newShots = prev + 1;
      setAccuracy(Math.round((targetsHit / newShots) * 100) || 0);
      return newShots;
    });
    
    playSound('gunshot');
  }, [gameState, createBullet, targetsHit, playSound]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const data = gameDataRef.current;
    
    data.mouseX = e.clientX - rect.left;
    data.mouseY = e.clientY - rect.top;
    
    // Update cannon angle - centered cannon
    const cannonX = canvas.width / 2;
    const cannonY = canvas.height - 100;
    const angle = Math.atan2(data.mouseY - cannonY, data.mouseX - cannonX);
    data.cannonAngle = angle;
    
    // Update crosshair with enhanced sway
    const swayAmount = weather === 'Wind' ? Math.abs(windStrength) * 0.5 + 1 : 1;
    data.crosshair.x = data.mouseX + Math.sin(Date.now() * 0.01) * swayAmount;
    data.crosshair.y = data.mouseY + Math.cos(Date.now() * 0.01) * swayAmount;
  }, [weather, windStrength]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const data = gameDataRef.current;
    const theme = THEMES[level % 6];
    
    // Clear canvas
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Enhanced weather effects
    if (weather === 'Rain') {
      ctx.strokeStyle = 'rgba(173, 216, 230, 0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 150; i++) {
        const x = (Math.random() * canvas.width + Date.now() * 0.05) % canvas.width;
        const y = (Date.now() * 0.02 + i * 8) % (canvas.height + 20);
        const windOffset = windStrength * 2;
        ctx.beginPath();
        ctx.moveTo(x + windOffset, y);
        ctx.lineTo(x - 3 + windOffset, y + 15);
        ctx.stroke();
      }
    } else if (weather === 'Fog') {
      const gradient = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (weather === 'Wind') {
      // Wind indicator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const length = Math.abs(windStrength) * 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length * Math.sign(windStrength), y);
        ctx.stroke();
      }
    }
    
    // Draw targets - larger
    data.targets.forEach(target => {
      if (!target.hit) {
        // Bullseye rings - larger
        const rings = [45, 35, 25, 15];
        const colors = ['#FF0000', '#FFFFFF', '#FF0000', '#FFFFFF'];
        
        rings.forEach((radius, i) => {
          ctx.fillStyle = colors[i];
          ctx.beginPath();
          ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Ring border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        
        // Center dot
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Target glow effect
        ctx.shadowColor = 'rgba(255, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });
    
    // Draw bullets and trails
    data.bullets.forEach(bullet => {
      // Trail
      ctx.strokeStyle = theme.trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      bullet.trail.forEach((point, i) => {
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      
      // Bullet
      ctx.fillStyle = theme.cannonball;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // 3D effect
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(bullet.x - 2, bullet.y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw cannon - centered and much larger
    const cannonX = canvas.width / 2;
    const cannonY = canvas.height - 100;
    
    // Cannon base - much larger
    ctx.fillStyle = '#654321';
    ctx.fillRect(cannonX - 50, cannonY - 20, 100, 40);
    
    // Cannon wheels - much larger
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(cannonX - 35, cannonY + 20, 18, 0, Math.PI * 2);
    ctx.arc(cannonX + 35, cannonY + 20, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Cannon barrel - much larger
    ctx.save();
    ctx.translate(cannonX, cannonY);
    ctx.rotate(data.cannonAngle);
    ctx.fillStyle = '#2F4F4F';
    ctx.fillRect(0, -12, 80, 24);
    
    // Cannon barrel detail
    ctx.fillStyle = '#1C1C1C';
    ctx.fillRect(0, -8, 80, 6);
    ctx.fillRect(0, 2, 80, 6);
    ctx.restore();
    
    // Muzzle flash - larger
    if (data.muzzleFlash > 0) {
      ctx.save();
      ctx.translate(cannonX, cannonY);
      ctx.rotate(data.cannonAngle);
      
      // Outer flash
      ctx.fillStyle = `rgba(255, 255, 0, ${data.muzzleFlash / 15})`;
      ctx.beginPath();
      ctx.arc(80, 0, data.muzzleFlash * 1.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner flash
      ctx.fillStyle = `rgba(255, 165, 0, ${data.muzzleFlash / 10})`;
      ctx.beginPath();
      ctx.arc(80, 0, data.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      data.muzzleFlash--;
    }
    
    // Draw crosshair
    if (gameState === 'PLAYING') {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(data.crosshair.x - 10, data.crosshair.y);
      ctx.lineTo(data.crosshair.x + 10, data.crosshair.y);
      ctx.moveTo(data.crosshair.x, data.crosshair.y - 10);
      ctx.lineTo(data.crosshair.x, data.crosshair.y + 10);
      ctx.stroke();
      
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(data.crosshair.x, data.crosshair.y, 15, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw particles
    data.particles.forEach(particle => {
      const alpha = particle.life / particle.maxLife;
      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // HUD
    if (gameState === 'PLAYING') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, 80);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Courier New';
      ctx.fillText(`Score: ${score.toLocaleString()}`, 10, 25);
      ctx.fillText(`Level: ${level}`, 10, 45);
      ctx.fillText(`Accuracy: ${accuracy}%`, 10, 65);
      
      ctx.fillText(`Theme: ${theme.name}`, 200, 25);
      ctx.fillText(`Weather: ${weather}`, 200, 45);
      if (windStrength !== 0) {
        const windDir = windStrength > 0 ? 'Right' : 'Left';
        ctx.fillText(`Wind: ${Math.abs(windStrength).toFixed(1)} ${windDir}`, 200, 65);
      }
      
      // Level transition indicator
      if (gameDataRef.current.levelTransition) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.font = '24px Courier New';
        ctx.fillText('LEVEL COMPLETE!', canvas.width/2 - 100, canvas.height/2);
        ctx.font = '16px Courier New';
      }
      
      // Lives (hearts)
      for (let i = 0; i < lives; i++) {
        const x = canvas.width - 30 - (i * 25);
        const y = 25;
        ctx.fillStyle = '#FF0000';
        ctx.font = '20px Arial';
        ctx.fillText('♥', x, y);
      }
    }
  }, [level, weather, windStrength, gameState, score, accuracy, lives]);

  const gameLoop = useCallback(() => {
    if (gameState === 'PLAYING' && !gameDataRef.current.paused) {
      updateTargets();
      updateBullets();
      updateParticles();
      checkLevelComplete();
    }
    
    render();
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, updateTargets, updateBullets, updateParticles, checkLevelComplete, render]);

  const resetGame = useCallback(() => {
    setScore(0);
    setLevel(1);
    setLives(10);
    setShotsFired(0);
    setTargetsHit(0);
    setAccuracy(100);
    setMaxLevel(1);
    gameDataRef.current.bullets = [];
    gameDataRef.current.targets = [];
    gameDataRef.current.particles = [];
    gameDataRef.current.paused = false;
  }, []);

  const handleKeyPress = useCallback((e) => {
    switch (gameState) {
      case 'MAIN_MENU':
        if (e.key === 'ArrowUp') setMenuIndex(prev => Math.max(0, prev - 1));
        if (e.key === 'ArrowDown') setMenuIndex(prev => Math.min(2, prev + 1));
        if (e.key === 'Enter' || e.key === ' ') {
          if (menuIndex === 0) setGameState('NAME_INPUT');
          else if (menuIndex === 1) setGameState('LEADERBOARD');
          else if (menuIndex === 2) window.close();
        }
        break;
      case 'NAME_INPUT':
        if (e.key === 'Enter' && playerName.trim()) {
          resetGame();
          setGameState('PLAYING');
          setTimeout(() => initializeLevel(), 100);
        }
        break;
      case 'PLAYING':
        if (e.key === 'Escape') {
          gameDataRef.current.paused = !gameDataRef.current.paused;
        }
        if (e.key === 'r' || e.key === 'R') {
          resetGame();
          setTimeout(() => initializeLevel(), 100);
        }
        if (e.key === 'm' || e.key === 'M') {
          setSoundEnabled(prev => !prev);
        }
        if (e.key === '+' || e.key === '=') {
          setVolume(prev => Math.min(1, prev + 0.1));
        }
        if (e.key === '-') {
          setVolume(prev => Math.max(0, prev - 0.1));
        }
        break;
      case 'GAME_OVER':
        if (e.key === 'Enter' || e.key === ' ') {
          setGameState('PROFILE_CHOICE');
        }
        break;
      case 'PROFILE_CHOICE':
        if (e.key === '1') {
          // Continue with same profile
          resetGame();
          setGameState('PLAYING');
          setTimeout(() => initializeLevel(), 100);
        }
        if (e.key === '2') {
          // New profile
          resetGame();
          setPlayerName('');
          setGameState('NAME_INPUT');
        }
        if (e.key === '3') {
          // Return to main menu
          resetGame();
          setPlayerName('');
          setGameState('MAIN_MENU');
          setMenuIndex(0);
        }
        break;
      case 'LEADERBOARD':
        if (e.key === 'Escape' || e.key === 'Enter') {
          setGameState('MAIN_MENU');
        }
        break;
    }
  }, [gameState, menuIndex, playerName, initializeLevel, resetGame]);

  useEffect(() => {
    loadLeaderboard();
    
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    window.addEventListener('keydown', handleKeyPress);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    
    animationRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [loadLeaderboard, handleKeyPress, handleCanvasClick, handleMouseMove, gameLoop]);

  const renderUI = () => {
    switch (gameState) {
      case 'MAIN_MENU':
        return (
          <div className="menu-overlay">
            <h1>🎯 Shadow Reaper: Target Master</h1>
            <div className="menu-options">
              <div className={menuIndex === 0 ? 'selected' : ''}>▶ Start Game</div>
              <div className={menuIndex === 1 ? 'selected' : ''}>▶ Leaderboard</div>
              <div className={menuIndex === 2 ? 'selected' : ''}>▶ Exit</div>
            </div>
            <p>Use Arrow Keys to navigate, Enter to select</p>
          </div>
        );
      
      case 'NAME_INPUT':
        return (
          <div className="menu-overlay">
            <h2>Enter Your Name</h2>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
              placeholder="Enter name (max 20 chars)"
              autoFocus
            />
            <p>Press Enter to continue</p>
          </div>
        );
      
      case 'GAME_OVER':
        return (
          <div className="menu-overlay">
            <h2>🎯 Game Over!</h2>
            <div className="stats">
              <p>Final Score: {score.toLocaleString()}</p>
              <p>Max Level: {maxLevel}</p>
              <p>Accuracy: {accuracy}%</p>
              <p>Targets Hit: {targetsHit}</p>
              <p>Shots Fired: {shotsFired}</p>
            </div>
            <p>Press Enter to continue</p>
          </div>
        );
      
      case 'PROFILE_CHOICE':
        return (
          <div className="menu-overlay">
            <h2>Choose Option</h2>
            <div className="menu-options">
              <div>1 - Continue with {playerName}</div>
              <div>2 - New Profile</div>
              <div>3 - Main Menu</div>
            </div>
          </div>
        );
      
      case 'LEADERBOARD':
        return (
          <div className="menu-overlay">
            <h2>🏆 Global Leaderboard</h2>
            <div className="leaderboard">
              {isLeaderboardLoading ? (
                <div className="leaderboard-loading">Loading global scores...</div>
              ) : leaderboard.length > 0 ? (
                leaderboard.slice(0, 10).map((entry, index) => (
                  <div key={entry.id || index} className="leaderboard-entry">
                    <span>#{index + 1}</span>
                    <span>{entry.name}</span>
                    <span>{entry.score.toLocaleString()}</span>
                    <span>L{entry.maxLevel}</span>
                    <span>{entry.accuracy}%</span>
                  </div>
                ))
              ) : (
                <div className="leaderboard-empty">No scores available yet</div>
              )}
            </div>
            <p>Press Escape to return</p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="game-container">
      <canvas ref={canvasRef} />
      {renderUI()}
      {gameState === 'PLAYING' && gameDataRef.current.paused && (
        <div className="pause-overlay">
          <h2>⏸️ PAUSED</h2>
          <p>Press Escape to resume</p>
          <div className="controls">
            <p>R - Restart | M - Toggle Sound</p>
            <p>+/- - Volume | ESC - Pause</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;

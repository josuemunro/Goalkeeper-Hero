// Get the canvas element
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // We WILL use this extensively now
const ballControlsContainer = document.getElementById('ball-controls-container');

// Define the canvas dimensions - now dynamic based on container
function getCanvasDimensions() {
  // Use container dimensions to avoid scrollbar issues
  const container = canvas.parentElement;
  return {
    width: container ? container.clientWidth : window.innerWidth,
    height: window.innerHeight * 0.75 // 75vh
  };
}

// Get current canvas dimensions
let CANVAS_WIDTH = getCanvasDimensions().width;
let CANVAS_HEIGHT = getCanvasDimensions().height;

// Matter.js Modules
let Engine, Runner, World, Bodies, Composite, Constraint, Events, Body;

// Game element properties
const BALL_INITIAL_RADIUS = 20; // WAS: BALL_RADIUS = 15. Let's make it bigger.
const BALL_MIN_SCALE = 0.65; // WAS: an effective 0.3. Let's make it end much bigger.
const GOAL_WIDTH = 250;

// Collision Categories
const KEEPER_CATEGORY = 0x0001;
const BALL_CATEGORY = 0x0002;
const KEEPER_PLATFORM_CATEGORY = 0x0004;
const DEFAULT_CATEGORY = 0x0008; // For general world boundaries if any

// Goalkeeper properties
const KEEPER_PART_COLOR = '#FF0000'; // Red for now
const KEEPER_STROKE_COLOR = '#000000';
const KEEPER_HEAD_RADIUS = 15;
const KEEPER_TORSO_WIDTH = 20;
const KEEPER_TORSO_HEIGHT = 60;
const KEEPER_LIMB_WIDTH = 10; // For arms and legs
const KEEPER_UPPER_ARM_LENGTH = 40;
const KEEPER_LOWER_ARM_LENGTH = 35;
const KEEPER_UPPER_LEG_LENGTH = 45;
const KEEPER_LOWER_LEG_LENGTH = 40;
const KEEPER_REACTION_FORCE = 0.85; // Adjust this to make the keeper faster/slower
const KEEPER_ARM_REACH_FORCE = 0.003; // A small, continuous force to pull the arm

// To hold goalkeeper parts (bodies and constraints)
let goalkeeper = {
  bodies: [],
  constraints: [],
  // To easily access specific parts if needed later for AI
  head: null,
  torso: null,
  leftArm: { upper: null, lower: null },
  rightArm: { upper: null, lower: null },
  leftLeg: { upper: null, lower: null },
  rightLeg: { upper: null, lower: null },
  isSaving: false,
  reachTarget: null, // {x, y} coordinates of where to reach
  reachingHand: null, // which body part is reaching (e.g., lowerLeftArm)
  // Animation state system
  animationState: 'ragdoll', // 'ragdoll', 'jumping', 'reaching', 'superman'
  animationStartTime: 0,
  animationDuration: 800, // How long animation lasts in ms
  savedPositions: {} // Store original positions for pose restoration
};

// Collision group for ragdoll parts to prevent self-collision
const RAGDOLL_COLLISION_GROUP = Matter.Body.nextGroup(true); // Use a unique negative group

// Store physics bodies and game state
let physicalBalls = [];
let ground;
let keeperPlatform;

// Speech bubble state
let speechBubble = {
  isVisible: false,
  text: "",
  opacity: 0,
  targetOpacity: 0,
  fadeSpeed: 0.05,
  displayDuration: 4000, // 4 seconds
  showStartTime: 0
};

// No more queue system - all shots fire immediately!

// Mouse interaction system for draggable keeper
let mouseInteraction = {
  isDragging: false,
  lastMouseX: 0,
  lastMouseY: 0,
  mouseHistory: [], // Track recent mouse positions for throw velocity
  maxHistoryLength: 5,
  followStrength: 0.03 // How strongly keeper follows mouse (0-1)
};

// Visual effects system
let particles = [];

class Particle {
  constructor(x, y, vx, vy, life, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = Math.random() * 4 + 2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.2; // gravity
    this.vx *= 0.98; // air resistance
    this.life--;
  }

  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.save(); // Save current context state
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore(); // Restore context state
  }

  isDead() {
    return this.life <= 0;
  }
}

function createAerialAdjustmentEffect(x, y) {
  // Create explosive particle effect
  const particleCount = 15;
  const colors = ['#FFD700', '#FFA500', '#FF6347', '#FFFFFF'];

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
    const speed = Math.random() * 8 + 3;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - Math.random() * 2; // Slight upward bias
    const life = Math.random() * 30 + 20;
    const color = colors[Math.floor(Math.random() * colors.length)];

    particles.push(new Particle(x, y, vx, vy, life, color));
  }
}

function checkGoalkeeperBounds() {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  const boundaryBuffer = 250; // Increased buffer - more forgiving bounds

  // Check if keeper is WAY out of bounds (not just a little bit)
  const isWayOutOfBounds =
    torso.position.x < -boundaryBuffer ||
    torso.position.x > CANVAS_WIDTH + boundaryBuffer ||
    torso.position.y < -boundaryBuffer ||
    torso.position.y > CANVAS_HEIGHT + boundaryBuffer;

  // Additional check: only reset if keeper is also moving away (not coming back)
  const isMovingAwayFromCenter = false; // We'll calculate this

  if (isWayOutOfBounds) {
    // Give keeper a chance to come back naturally before forcing reset
    const centerX = CANVAS_WIDTH / 2;
    const centerY = CANVAS_HEIGHT / 2;
    const distanceFromCenter = Math.sqrt(
      (torso.position.x - centerX) ** 2 +
      (torso.position.y - centerY) ** 2
    );

    // Scale the reset distance based on canvas size
    const maxDistanceFromCenter = Math.max(CANVAS_WIDTH * 0.6, 400); // 60% of width or 400px minimum

    if (distanceFromCenter > maxDistanceFromCenter) {
      console.log(`Goalkeeper WAY out of bounds (${distanceFromCenter.toFixed(0)}px from center, max: ${maxDistanceFromCenter.toFixed(0)})! Gentle reset.`);
      resetGoalkeeper();
    }
  }
}

function resetGoalkeeper() {
  if (!goalkeeper.torso) return;

  console.log('Gentle goalkeeper reset initiated...');

  // Reset keeper position to center of goal
  const resetX = CANVAS_WIDTH / 2;
  const resetY = CANVAS_HEIGHT * 0.4; // Slightly higher than platform

  // GENTLE RESET: First stop all motion, then gradually move to position
  goalkeeper.bodies.forEach(body => {
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    // Reset any extreme angles to prevent constraint stress
    if (Math.abs(body.angle) > Math.PI * 2) {
      Body.setAngle(body, body.angle % (Math.PI * 2));
    }
  });

  // Position ALL body parts relative to torso to prevent constraint stress
  const torso = goalkeeper.torso;
  Body.setPosition(torso, { x: resetX, y: resetY });
  Body.setAngle(torso, 0); // Make torso upright

  // Position head relative to torso
  if (goalkeeper.head) {
    Body.setPosition(goalkeeper.head, {
      x: resetX,
      y: resetY - 25 // Above torso
    });
    Body.setAngle(goalkeeper.head, 0);
  }

  // Position arms in natural hanging position
  if (goalkeeper.leftArm.upper) {
    Body.setPosition(goalkeeper.leftArm.upper, {
      x: resetX - 25,
      y: resetY - 15
    });
    Body.setAngle(goalkeeper.leftArm.upper, 0);
  }

  if (goalkeeper.leftArm.lower) {
    Body.setPosition(goalkeeper.leftArm.lower, {
      x: resetX - 35,
      y: resetY + 15
    });
    Body.setAngle(goalkeeper.leftArm.lower, 0);
  }

  if (goalkeeper.rightArm.upper) {
    Body.setPosition(goalkeeper.rightArm.upper, {
      x: resetX + 25,
      y: resetY - 15
    });
    Body.setAngle(goalkeeper.rightArm.upper, 0);
  }

  if (goalkeeper.rightArm.lower) {
    Body.setPosition(goalkeeper.rightArm.lower, {
      x: resetX + 35,
      y: resetY + 15
    });
    Body.setAngle(goalkeeper.rightArm.lower, 0);
  }

  // Position legs in standing position
  if (goalkeeper.leftLeg.upper) {
    Body.setPosition(goalkeeper.leftLeg.upper, {
      x: resetX - 15,
      y: resetY + 35
    });
    Body.setAngle(goalkeeper.leftLeg.upper, 0);
  }

  if (goalkeeper.leftLeg.lower) {
    Body.setPosition(goalkeeper.leftLeg.lower, {
      x: resetX - 15,
      y: resetY + 75
    });
    Body.setAngle(goalkeeper.leftLeg.lower, 0);
  }

  if (goalkeeper.rightLeg.upper) {
    Body.setPosition(goalkeeper.rightLeg.upper, {
      x: resetX + 15,
      y: resetY + 35
    });
    Body.setAngle(goalkeeper.rightLeg.upper, 0);
  }

  if (goalkeeper.rightLeg.lower) {
    Body.setPosition(goalkeeper.rightLeg.lower, {
      x: resetX + 15,
      y: resetY + 75
    });
    Body.setAngle(goalkeeper.rightLeg.lower, 0);
  }

  // Reset keeper state
  goalkeeper.isSaving = false;
  goalkeeper.reachTarget = null;
  goalkeeper.reachingHand = null;

  // Clear any dragging state
  mouseInteraction.isDragging = false;
  mouseInteraction.mouseHistory = [];

  console.log('Goalkeeper gently reset to natural standing position.');
}

function checkStuckBalls() {
  const currentTime = Date.now();

  ballsData.forEach(ballInfo => {
    if (ballInfo.isShooting && ballInfo.shotStartTime > 0) {
      const shotDuration = currentTime - ballInfo.shotStartTime;

      // Check if ball has been shooting for too long or is stuck
      const body = ballInfo.matterBody;
      const isVerySlowOrStopped = body && (
        Math.abs(body.velocity.x) < 0.1 &&
        Math.abs(body.velocity.y) < 0.1 &&
        shotDuration > 1000 // Moving too slowly for more than 1 second
      );

      if (shotDuration > ballInfo.maxShotDuration || isVerySlowOrStopped) {
        console.log(`Ball ${ballInfo.id} appears stuck! Duration: ${shotDuration}ms, velocity: (${body?.velocity.x.toFixed(2)}, ${body?.velocity.y.toFixed(2)})`);
        forceResetBall(ballInfo);
      }
    }
  });
}

function forceResetBall(ballInfo) {
  const body = ballInfo.matterBody;
  if (!body) return;

  console.log(`Force resetting ball ${ballInfo.id}`);

  // Reset physics state
  Body.setStatic(body, true);
  body.isSensor = true;
  Body.setPosition(body, { x: ballInfo.initialX, y: ballInfo.initialY });
  Body.setVelocity(body, { x: 0, y: 0 });
  Body.setAngle(body, 0);
  Body.setAngularVelocity(body, 0);

  // Reset visual/game state
  ballInfo.currentScale = 1;
  ballInfo.isShooting = false;
  ballInfo.shotStartTime = 0;

  // Reset collision group
  body.collisionFilter.group = 0;

  // Get new problem for this ball
  assignNewProblem(ballInfo);

  // No more queue processing needed!
}

function applyStandingForces() {
  if (!goalkeeper.torso) return;

  // Stronger, more targeted forces
  const TORSO_UPRIGHT_FORCE = 0.008; // Increased for better torso control
  const LEG_SUPPORT_FORCE = 0.006; // Stronger leg support
  const BALANCE_FORCE = 0.004; // Keep center of mass over feet
  const RECOVERY_FORCE = 0.015; // Emergency recovery

  const torso = goalkeeper.torso;
  const platformY = CANVAS_HEIGHT * 0.6;

  // 1. TORSO UPRIGHTNESS - Much stronger angular correction
  const targetAngle = 0; // Perfectly upright
  const angleError = torso.angle - targetAngle;

  if (Math.abs(angleError) > 0.05) { // Tighter tolerance
    // Apply angular impulse to correct rotation
    Body.setAngularVelocity(torso, torso.angularVelocity - (angleError * TORSO_UPRIGHT_FORCE));
  }

  // 2. ACTIVE LEG SUPPORT - Push down on feet for support
  const feet = [goalkeeper.leftLeg.lower, goalkeeper.rightLeg.lower];
  feet.forEach(foot => {
    if (foot) {
      const footDistanceFromPlatform = platformY - foot.position.y;

      if (footDistanceFromPlatform > 5) { // Foot is above platform
        // Strong downward force to plant foot
        Body.applyForce(foot, foot.position, { x: 0, y: LEG_SUPPORT_FORCE });

        // Also reduce upward velocity if foot is moving up
        if (foot.velocity.y < 0) {
          Body.setVelocity(foot, { x: foot.velocity.x, y: foot.velocity.y * 0.8 });
        }
      }
    }
  });

  // 3. BALANCE CONTROL - Keep torso over center of feet
  const leftFoot = goalkeeper.leftLeg.lower;
  const rightFoot = goalkeeper.rightLeg.lower;

  if (leftFoot && rightFoot) {
    const feetCenterX = (leftFoot.position.x + rightFoot.position.x) / 2;
    const balanceError = torso.position.x - feetCenterX;

    if (Math.abs(balanceError) > 20) { // If torso is off-center
      // Apply corrective horizontal force
      Body.applyForce(torso, torso.position, {
        x: -balanceError * BALANCE_FORCE * 0.3,
        y: 0
      });

      // Also adjust foot positions slightly
      const footCorrection = balanceError * 0.0001;
      Body.applyForce(leftFoot, leftFoot.position, { x: -footCorrection, y: 0 });
      Body.applyForce(rightFoot, rightFoot.position, { x: -footCorrection, y: 0 });
    }
  }

  // 4. EMERGENCY RECOVERY - If keeper is really messed up
  const expectedTorsoY = CANVAS_HEIGHT * 0.4;
  const torsoTooLow = torso.position.y > expectedTorsoY + 40;
  const torsoTooFast = torso.velocity.y > 2; // Falling too fast

  if (torsoTooLow || torsoTooFast) {
    // Emergency upward boost
    Body.applyForce(torso, torso.position, { x: 0, y: -RECOVERY_FORCE });

    // Dampen excessive velocities
    if (Math.abs(torso.velocity.x) > 3) {
      Body.setVelocity(torso, { x: torso.velocity.x * 0.7, y: torso.velocity.y });
    }
  }

  // 5. JOINT TENSION - Prevent joints from getting too loose
  goalkeeper.constraints.forEach(constraint => {
    if (constraint.length > constraint.restLength * 1.5) {
      // Joint is overstretched - add tension
      const tensionFactor = 0.9;
      constraint.stiffness = Math.min(constraint.stiffness * 1.01, 0.95);
    }
  });
}

function preventKeeperSpinning() {
  if (!goalkeeper.torso) return;

  const MAX_ANGULAR_VELOCITY = 8; // Radians per second - anything higher gets damped
  const ANGULAR_DAMPING = 0.85; // How much to reduce excessive spinning
  const MAX_CONSTRAINT_STRETCH = 2.0; // Max stretch before correction
  const POSITION_CORRECTION_STRENGTH = 0.02; // How strongly to pull parts back

  // 1. ANGULAR VELOCITY LIMITING - Stop crazy spinning
  goalkeeper.bodies.forEach(body => {
    if (Math.abs(body.angularVelocity) > MAX_ANGULAR_VELOCITY) {
      // Reduce spinning but don't completely stop it
      Body.setAngularVelocity(body, body.angularVelocity * ANGULAR_DAMPING);

      // Debug excessive spinning
      if (Math.abs(body.angularVelocity) > MAX_ANGULAR_VELOCITY * 2) {
        console.log(`Excessive spinning detected on ${body.label}: ${body.angularVelocity.toFixed(2)} rad/s`);
      }
    }
  });

  // 2. CONSTRAINT LENGTH MONITORING - Fix overstretched joints
  goalkeeper.constraints.forEach(constraint => {
    const currentLength = constraint.length;
    const restLength = constraint.restLength || 10; // Default if not set
    const stretchRatio = currentLength / restLength;

    if (stretchRatio > MAX_CONSTRAINT_STRETCH) {
      // Joint is way too stretched - apply corrective forces
      const bodyA = constraint.bodyA;
      const bodyB = constraint.bodyB;

      if (bodyA && bodyB) {
        // Calculate direction to pull bodies back together
        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          const correctionForce = POSITION_CORRECTION_STRENGTH * (stretchRatio - 1);
          const forceX = (dx / distance) * correctionForce;
          const forceY = (dy / distance) * correctionForce;

          // Pull them back together
          Body.applyForce(bodyA, bodyA.position, { x: forceX, y: forceY });
          Body.applyForce(bodyB, bodyB.position, { x: -forceX, y: -forceY });
        }
      }
    }
  });

  // 3. HEAD STABILIZATION - Keep head reasonably positioned
  if (goalkeeper.head && goalkeeper.torso) {
    const head = goalkeeper.head;
    const torso = goalkeeper.torso;

    // Check if head is too far from torso
    const headToTorsoDistance = Math.sqrt(
      (head.position.x - torso.position.x) ** 2 +
      (head.position.y - torso.position.y) ** 2
    );

    const maxHeadDistance = 60; // Max reasonable distance
    if (headToTorsoDistance > maxHeadDistance) {
      // Pull head back towards torso
      const pullStrength = 0.005;
      const dx = torso.position.x - head.position.x;
      const dy = torso.position.y - head.position.y - 30; // Offset for neck

      Body.applyForce(head, head.position, {
        x: dx * pullStrength,
        y: dy * pullStrength
      });
    }
  }

  // 4. LIMB ANGLE LIMITS - Prevent impossible rotations
  const limbBodies = [
    goalkeeper.leftArm.upper, goalkeeper.leftArm.lower,
    goalkeeper.rightArm.upper, goalkeeper.rightArm.lower,
    goalkeeper.leftLeg.upper, goalkeeper.leftLeg.lower,
    goalkeeper.rightLeg.upper, goalkeeper.rightLeg.lower
  ];

  limbBodies.forEach(limb => {
    if (limb) {
      // If limb is rotating too fast, dampen it
      if (Math.abs(limb.angularVelocity) > MAX_ANGULAR_VELOCITY * 0.7) {
        Body.setAngularVelocity(limb, limb.angularVelocity * 0.9);
      }

      // Prevent extreme angles (more than 6 full rotations)
      const extremeAngle = Math.PI * 12; // 6 full rotations
      if (Math.abs(limb.angle) > extremeAngle) {
        // Reset angle to a more reasonable value
        const normalizedAngle = limb.angle % (Math.PI * 2);
        Body.setAngle(limb, normalizedAngle);
        Body.setAngularVelocity(limb, limb.angularVelocity * 0.5);
      }
    }
  });
}

// 🎬 SAVE ANIMATION SYSTEM
function determineSaveAnimation(targetX, targetY) {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  const platformY = CANVAS_HEIGHT * 0.6;

  // Calculate distance to target
  const distanceToTarget = Math.sqrt(
    (targetX - torso.position.x) ** 2 +
    (targetY - torso.position.y) ** 2
  );

  // Check if keeper is on ground (within 50px of platform)
  const feet = [goalkeeper.leftLeg.lower, goalkeeper.rightLeg.lower];
  const isOnGround = feet.some(foot =>
    foot && Math.abs(foot.position.y - platformY) < 50
  );

  // Check if target is high (in air)
  const isHighTarget = targetY < CANVAS_HEIGHT * 0.45;

  // Determine animation type based on context
  let animationType = 'ragdoll'; // Default

  if (distanceToTarget < 80) {
    // Close save - just reach out
    animationType = 'reaching';
  } else if (isOnGround && isHighTarget) {
    // Ground + high target = jumping save
    animationType = 'jumping';
  } else if (!isOnGround) {
    // Already in air = superman dive
    animationType = 'superman';
  } else if (distanceToTarget > 120) {
    // Far distance = diving save
    animationType = 'superman';
  }

  console.log(`Save animation: ${animationType} (distance: ${distanceToTarget.toFixed(0)}, onGround: ${isOnGround}, highTarget: ${isHighTarget})`);

  // Apply the animation
  applySaveAnimation(animationType);
}

function applySaveAnimation(animationType) {
  goalkeeper.animationState = animationType;
  goalkeeper.animationStartTime = Date.now();

  // Store current positions for restoration later
  goalkeeper.savedPositions = {};
  goalkeeper.bodies.forEach(body => {
    goalkeeper.savedPositions[body.label] = {
      x: body.position.x,
      y: body.position.y,
      angle: body.angle
    };
  });

  // Apply the specific pose
  switch (animationType) {
    case 'jumping':
      applyJumpingPose();
      break;
    case 'reaching':
      applyReachingPose();
      break;
    case 'superman':
      applySupermanPose();
      break;
    default:
      // Stay in ragdoll mode
      break;
  }
}

function applyJumpingPose() {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  const targetX = goalkeeper.reachTarget.x;

  // Bend legs for jumping motion
  if (goalkeeper.leftLeg.upper && goalkeeper.leftLeg.lower) {
    Body.setAngle(goalkeeper.leftLeg.upper, -0.3); // Bend knee
    Body.setAngle(goalkeeper.leftLeg.lower, 0.6);  // Bend shin
  }

  if (goalkeeper.rightLeg.upper && goalkeeper.rightLeg.lower) {
    Body.setAngle(goalkeeper.rightLeg.upper, -0.3);
    Body.setAngle(goalkeeper.rightLeg.lower, 0.6);
  }

  // Extend reaching arm toward target
  const isLeftSide = targetX < torso.position.x;
  if (isLeftSide && goalkeeper.leftArm.upper && goalkeeper.leftArm.lower) {
    Body.setAngle(goalkeeper.leftArm.upper, -1.2); // Reach up
    Body.setAngle(goalkeeper.leftArm.lower, -0.5);
  } else if (!isLeftSide && goalkeeper.rightArm.upper && goalkeeper.rightArm.lower) {
    Body.setAngle(goalkeeper.rightArm.upper, 1.2);
    Body.setAngle(goalkeeper.rightArm.lower, 0.5);
  }

  // Add upward jump force
  Body.applyForce(torso, torso.position, { x: 0, y: -0.015 });
}

function applyReachingPose() {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  const targetX = goalkeeper.reachTarget.x;

  // Just extend arms toward target - simple reach
  const isLeftSide = targetX < torso.position.x;

  if (isLeftSide && goalkeeper.leftArm.upper && goalkeeper.leftArm.lower) {
    Body.setAngle(goalkeeper.leftArm.upper, -0.8); // Extend left
    Body.setAngle(goalkeeper.leftArm.lower, 0);
  } else if (!isLeftSide && goalkeeper.rightArm.upper && goalkeeper.rightArm.lower) {
    Body.setAngle(goalkeeper.rightArm.upper, 0.8);  // Extend right
    Body.setAngle(goalkeeper.rightArm.lower, 0);
  }
}

function applySupermanPose() {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  const targetX = goalkeeper.reachTarget.x;

  // Superman flying pose - one arm extended, other by side
  const isLeftSide = targetX < torso.position.x;

  if (isLeftSide) {
    // Reaching with left arm
    if (goalkeeper.leftArm.upper && goalkeeper.leftArm.lower) {
      Body.setAngle(goalkeeper.leftArm.upper, -1.5); // Full extension
      Body.setAngle(goalkeeper.leftArm.lower, 0);
    }
    // Right arm by side
    if (goalkeeper.rightArm.upper && goalkeeper.rightArm.lower) {
      Body.setAngle(goalkeeper.rightArm.upper, 0.3);
      Body.setAngle(goalkeeper.rightArm.lower, 0);
    }
  } else {
    // Reaching with right arm
    if (goalkeeper.rightArm.upper && goalkeeper.rightArm.lower) {
      Body.setAngle(goalkeeper.rightArm.upper, 1.5);
      Body.setAngle(goalkeeper.rightArm.lower, 0);
    }
    // Left arm by side
    if (goalkeeper.leftArm.upper && goalkeeper.leftArm.lower) {
      Body.setAngle(goalkeeper.leftArm.upper, -0.3);
      Body.setAngle(goalkeeper.leftArm.lower, 0);
    }
  }

  // Extend legs backward for diving pose
  if (goalkeeper.leftLeg.upper && goalkeeper.leftLeg.lower) {
    Body.setAngle(goalkeeper.leftLeg.upper, 0.4);
    Body.setAngle(goalkeeper.leftLeg.lower, -0.2);
  }

  if (goalkeeper.rightLeg.upper && goalkeeper.rightLeg.lower) {
    Body.setAngle(goalkeeper.rightLeg.upper, 0.4);
    Body.setAngle(goalkeeper.rightLeg.lower, -0.2);
  }
}

function updateAnimationState() {
  if (!goalkeeper.torso) return;

  // Check if we're in an animation state and if it should expire
  if (goalkeeper.animationState !== 'ragdoll') {
    const elapsed = Date.now() - goalkeeper.animationStartTime;

    if (elapsed > goalkeeper.animationDuration) {
      // Animation time expired - return to ragdoll
      console.log(`Animation ${goalkeeper.animationState} completed, returning to ragdoll`);
      goalkeeper.animationState = 'ragdoll';
      goalkeeper.animationStartTime = 0;

      // Optional: Apply small forces to make transition smoother
      // (The standing forces will naturally help the keeper recover)
    }
  }
}

// Mobile detection
function isMobile() {
  return window.innerWidth <= 480;
}

// Initialize ballsData based on device type
function initializeBallsData() {
  const ballSpacing = CANVAS_WIDTH * 0.15; // 15% of canvas width for spacing
  const ballY = CANVAS_HEIGHT - 60; // 60px from bottom

  if (isMobile()) {
    // Mobile: only one ball
    return [
      { id: 'ball1', problemText: "", initialX: CANVAS_WIDTH / 2, initialY: ballY, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1, shotStartTime: 0, maxShotDuration: 3000 }
    ];
  } else {
    // Desktop: three balls with proportional spacing
    return [
      { id: 'ball1', problemText: "", initialX: CANVAS_WIDTH / 2 - ballSpacing, initialY: ballY, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1, shotStartTime: 0, maxShotDuration: 3000 },
      { id: 'ball2', problemText: "", initialX: CANVAS_WIDTH / 2, initialY: ballY, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1, shotStartTime: 0, maxShotDuration: 3000 },
      { id: 'ball3', problemText: "", initialX: CANVAS_WIDTH / 2 + ballSpacing, initialY: ballY, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1, shotStartTime: 0, maxShotDuration: 3000 }
    ];
  }
}

let ballsData = initializeBallsData();

const problemSolutionList = [
  { problem: "Slow Load Times", solution: "Optimize images and use lazy loading!" },
  { problem: "Poor SEO", solution: "Improve on-page SEO and build quality backlinks!" },
  { problem: "Low Conversion Rates", solution: "A/B test your CTAs and improve UX!" },
  { problem: "CMS Limitations", solution: "Leverage Webflow's API for extended functionality!" },
  { problem: "Design Inconsistencies", solution: "Establish a strong design system and style guide!" },
  { problem: "Accessibility Issues", solution: "Follow WCAG guidelines and test with screen readers!" },
  { problem: "Only one nested CMS collection per page", solution: "Use custom code or Finsweet Attributes for multiple nested lists!" }
];
let problemCycleIndex = 0;

// Physics engine setup
let engine;
let runner;

// Goal Image
const goalImage = new Image();
let goalImageLoaded = false;
goalImage.src = 'goal.png'; // <<<--- MAKE SURE THIS PATH IS CORRECT!
goalImage.onload = () => {
  goalImageLoaded = true;
  console.log('Goal image loaded successfully.');
  // Potentially call a draw function here if init is already done
  // For now, gameLoop will handle drawing once it starts.
};
goalImage.onerror = () => {
  console.error('Error loading goal image.');
  // You might want to draw a fallback rectangle if the image fails
};

// Goalkeeper customization images
const keeperImages = {
  head: null,
  jersey: null,
  gloves: null
};

let keeperImagesLoaded = {
  head: false,
  jersey: false,
  gloves: false
};

// Function to load goalkeeper images (can be called to customize)
function loadKeeperImage(bodyPart, imageSrc) {
  if (!['head', 'jersey', 'gloves'].includes(bodyPart)) {
    console.error(`Invalid body part: ${bodyPart}`);
    return;
  }

  const img = new Image();
  img.onload = () => {
    keeperImages[bodyPart] = img;
    keeperImagesLoaded[bodyPart] = true;
    console.log(`Keeper ${bodyPart} image loaded successfully.`);
  };
  img.onerror = () => {
    console.error(`Error loading keeper ${bodyPart} image: ${imageSrc}`);
    keeperImagesLoaded[bodyPart] = false;
  };
  img.src = imageSrc;
}

// Public interface for easy goalkeeper customization
window.customizeGoalkeeper = {
  setHead: (imageSrc) => loadKeeperImage('head', imageSrc),
  setJersey: (imageSrc) => loadKeeperImage('jersey', imageSrc),
  setGloves: (imageSrc) => loadKeeperImage('gloves', imageSrc)
};

// Example usage:
customizeGoalkeeper.setHead('keeper-head.png');
// customizeGoalkeeper.setJersey('path/to/jersey.png');
// customizeGoalkeeper.setGloves('path/to/gloves.png');

// Debug function to test particle system manually
window.testParticles = function () {
  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  createAerialAdjustmentEffect(centerX, centerY);
  console.log('Manual particle test triggered! Particle count:', particles.length);
};

// Debug functions for tuning
window.adjustMouseSensitivity = function (strength) {
  mouseInteraction.followStrength = strength;
  console.log(`Mouse follow strength set to: ${strength}`);
};

window.showKeeperStats = function () {
  if (!goalkeeper.torso) return;

  const torso = goalkeeper.torso;
  console.log('--- KEEPER STATS ---');
  console.log(`Position: (${torso.position.x.toFixed(1)}, ${torso.position.y.toFixed(1)})`);
  console.log(`Velocity: (${torso.velocity.x.toFixed(2)}, ${torso.velocity.y.toFixed(2)})`);
  console.log(`Angle: ${(torso.angle * 180 / Math.PI).toFixed(1)}°`);
  console.log(`Angular velocity: ${torso.angularVelocity.toFixed(2)} rad/s`);
  console.log(`Dragging: ${mouseInteraction.isDragging}`);

  // Check foot positions
  const leftFoot = goalkeeper.leftLeg.lower;
  const rightFoot = goalkeeper.rightLeg.lower;
  if (leftFoot && rightFoot) {
    const platformY = CANVAS_HEIGHT * 0.6;
    console.log(`Left foot distance from platform: ${(platformY - leftFoot.position.y).toFixed(1)}`);
    console.log(`Right foot distance from platform: ${(platformY - rightFoot.position.y).toFixed(1)}`);
  }
};

// Emergency functions for when keeper gets too crazy
window.calmKeeperDown = function () {
  if (!goalkeeper.torso) return;

  console.log('Calming keeper down - reducing all velocities and spins');

  goalkeeper.bodies.forEach(body => {
    // Reduce all velocities by 50%
    Body.setVelocity(body, {
      x: body.velocity.x * 0.5,
      y: body.velocity.y * 0.5
    });

    // Reduce angular velocity by 70%
    Body.setAngularVelocity(body, body.angularVelocity * 0.3);
  });
};

window.resetKeeperCompletely = function () {
  console.log('EMERGENCY KEEPER RESET!');
  resetGoalkeeper(); // Use existing reset function
};

// Animation testing functions
window.testJumping = function () {
  applySaveAnimation('jumping');
  console.log('Testing jumping animation');
};

window.testReaching = function () {
  applySaveAnimation('reaching');
  console.log('Testing reaching animation');
};

window.testSuperman = function () {
  applySaveAnimation('superman');
  console.log('Testing superman animation');
};

window.testAllAnimations = function () {
  console.log('Testing all animations with delays...');
  applySaveAnimation('reaching');
  setTimeout(() => applySaveAnimation('jumping'), 2000);
  setTimeout(() => applySaveAnimation('superman'), 4000);
  setTimeout(() => goalkeeper.animationState = 'ragdoll', 6000);
};

// Debug timing function
window.showSaveTimingInfo = function () {
  const activeBalls = ballsData.filter(ball => ball.isShooting);
  const goalLineY = CANVAS_HEIGHT * 0.27;

  console.log('--- SAVE TIMING DEBUG ---');
  console.log(`Goal line Y: ${goalLineY.toFixed(1)}`);
  console.log(`Canvas size: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);

  activeBalls.forEach(ball => {
    const pos = ball.matterBody.position;
    const distanceToGoal = pos.y - goalLineY;
    console.log(`${ball.id}: Y=${pos.y.toFixed(1)}, distance to goal line: ${distanceToGoal.toFixed(1)}px`);
  });

  if (goalkeeper.reachTarget) {
    console.log(`Keeper reaching for: (${goalkeeper.reachTarget.x.toFixed(1)}, ${goalkeeper.reachTarget.y.toFixed(1)})`);
    console.log(`Animation state: ${goalkeeper.animationState}`);
  }
};

// Debug ball states
window.showBallStates = function () {
  console.log('--- BALL STATES ---');
  ballsData.forEach(ball => {
    const body = ball.matterBody;
    if (body) {
      console.log(`${ball.id}: isShooting=${ball.isShooting}, pos=(${body.position.x.toFixed(1)}, ${body.position.y.toFixed(1)}), isStatic=${body.isStatic}, isSensor=${body.isSensor}`);
    } else {
      console.log(`${ball.id}: NO MATTER BODY!`);
    }
  });
  console.log(`Total balls in ballsData: ${ballsData.length}`);
};

// Mouse interaction functions for draggable keeper
function getMousePos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

function isMouseNearKeeper(mouseX, mouseY) {
  if (!goalkeeper.torso) return false;

  const keeperX = goalkeeper.torso.position.x;
  const keeperY = goalkeeper.torso.position.y;
  const distance = Math.sqrt((mouseX - keeperX) ** 2 + (mouseY - keeperY) ** 2);

  return distance < 80; // Within 80 pixels of keeper's torso
}

function handleMouseDown(evt) {
  const mousePos = getMousePos(canvas, evt);

  if (isMouseNearKeeper(mousePos.x, mousePos.y)) {
    mouseInteraction.isDragging = true;
    mouseInteraction.lastMouseX = mousePos.x;
    mouseInteraction.lastMouseY = mousePos.y;
    canvas.style.cursor = 'grabbing';
    console.log('Started dragging keeper!');
  }
}

function handleMouseMove(evt) {
  const mousePos = getMousePos(canvas, evt);

  // Update cursor when hovering over keeper
  if (!mouseInteraction.isDragging) {
    if (isMouseNearKeeper(mousePos.x, mousePos.y)) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  // Handle dragging with smooth following
  if (mouseInteraction.isDragging && goalkeeper.torso) {
    // Add to mouse history for throw velocity calculation
    mouseInteraction.mouseHistory.push({
      x: mousePos.x,
      y: mousePos.y,
      time: Date.now()
    });

    // Keep history size manageable
    if (mouseInteraction.mouseHistory.length > mouseInteraction.maxHistoryLength) {
      mouseInteraction.mouseHistory.shift();
    }

    // Smooth follow: pull torso towards mouse position
    const torso = goalkeeper.torso;
    const targetX = mousePos.x;
    const targetY = mousePos.y;

    // Calculate gentle pull force towards mouse
    const pullX = (targetX - torso.position.x) * mouseInteraction.followStrength;
    const pullY = (targetY - torso.position.y) * mouseInteraction.followStrength;

    Body.applyForce(torso, torso.position, { x: pullX, y: pullY });

    mouseInteraction.lastMouseX = mousePos.x;
    mouseInteraction.lastMouseY = mousePos.y;
  }
}

function handleMouseUp(evt) {
  if (mouseInteraction.isDragging) {
    // Calculate throw velocity from recent mouse movement
    calculateAndApplyThrowVelocity();

    mouseInteraction.isDragging = false;
    mouseInteraction.mouseHistory = []; // Clear history
    canvas.style.cursor = 'default';
    console.log('Stopped dragging keeper - applied throw velocity!');
  }
}

function calculateAndApplyThrowVelocity() {
  if (mouseInteraction.mouseHistory.length < 2 || !goalkeeper.torso) return;

  // Get the most recent mouse movements
  const recent = mouseInteraction.mouseHistory.slice(-3); // Last 3 positions
  const oldest = recent[0];
  const newest = recent[recent.length - 1];

  const timeDiff = newest.time - oldest.time;
  if (timeDiff === 0) return; // Avoid division by zero

  // Calculate velocity (pixels per millisecond, then convert to appropriate scale)
  const velocityX = (newest.x - oldest.x) / timeDiff;
  const velocityY = (newest.y - oldest.y) / timeDiff;

  // Scale and limit the throw force - more conservative to prevent spinning
  const throwStrength = 0.03; // Reduced from 0.05 to prevent excessive momentum
  const maxThrow = 0.15; // Reduced max throw velocity to prevent spinning

  let throwX = velocityX * throwStrength;
  let throwY = velocityY * throwStrength;

  // Limit throw velocity
  const throwMagnitude = Math.sqrt(throwX * throwX + throwY * throwY);
  if (throwMagnitude > maxThrow) {
    const scale = maxThrow / throwMagnitude;
    throwX *= scale;
    throwY *= scale;
  }

  // Additional safety: don't throw if mouse was barely moving
  if (throwMagnitude < 0.01) {
    throwX = 0;
    throwY = 0;
  }

  // Apply the throw velocity to the torso
  Body.setVelocity(goalkeeper.torso, {
    x: goalkeeper.torso.velocity.x + throwX,
    y: goalkeeper.torso.velocity.y + throwY
  });

  console.log(`Throw applied: vx=${throwX.toFixed(3)}, vy=${throwY.toFixed(3)}`);
}

function drawKeeperCustomizations() {
  // Draw custom head image with preserved aspect ratio
  if (keeperImagesLoaded.head && keeperImages.head && goalkeeper.head) {
    const head = goalkeeper.head;
    const maxSize = KEEPER_HEAD_RADIUS * 2.4; // Max size constraint

    // Calculate scaled dimensions preserving aspect ratio
    const imgAspect = keeperImages.head.width / keeperImages.head.height;
    let drawWidth, drawHeight;

    if (imgAspect > 1) {
      // Wide image - constrain by width
      drawWidth = maxSize;
      drawHeight = maxSize / imgAspect;
    } else {
      // Tall image - constrain by height
      drawHeight = maxSize;
      drawWidth = maxSize * imgAspect;
    }

    ctx.save();
    ctx.translate(head.position.x, head.position.y);
    ctx.rotate(head.angle);
    ctx.drawImage(
      keeperImages.head,
      -drawWidth / 2, -drawHeight / 2,
      drawWidth, drawHeight
    );
    ctx.restore();
  }

  // Draw custom jersey image on torso
  if (keeperImagesLoaded.jersey && keeperImages.jersey && goalkeeper.torso) {
    const torso = goalkeeper.torso;
    const imgWidth = KEEPER_TORSO_WIDTH * 1.5; // Slightly larger than torso
    const imgHeight = KEEPER_TORSO_HEIGHT * 1.2;

    ctx.save();
    ctx.translate(torso.position.x, torso.position.y);
    ctx.rotate(torso.angle);
    ctx.drawImage(
      keeperImages.jersey,
      -imgWidth / 2, -imgHeight / 2,
      imgWidth, imgHeight
    );
    ctx.restore();
  }

  // Draw custom gloves on hands (lower arms)
  if (keeperImagesLoaded.gloves && keeperImages.gloves) {
    [goalkeeper.leftArm.lower, goalkeeper.rightArm.lower].forEach(hand => {
      if (hand) {
        const imgSize = KEEPER_LIMB_WIDTH * 2.5; // Make gloves larger than the hand

        ctx.save();
        ctx.translate(hand.position.x, hand.position.y);
        ctx.rotate(hand.angle);
        ctx.drawImage(
          keeperImages.gloves,
          -imgSize / 2, -imgSize / 2,
          imgSize, imgSize
        );
        ctx.restore();
      }
    });
  }
}

// Function to set canvas size
function resizeCanvas() {
  const dimensions = getCanvasDimensions();
  CANVAS_WIDTH = dimensions.width;
  CANVAS_HEIGHT = dimensions.height;

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  console.log(`Canvas resized to: ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
  // No Matter.Render to update, our custom draw will use these dimensions
}

// Handle window resize for mobile responsiveness
function handleResize() {
  const wasMobile = ballsData.length === 1;
  const nowMobile = isMobile();

  // If device type changed (mobile to desktop or vice versa)
  if (wasMobile !== nowMobile) {
    console.log(`Device type changed. Mobile: ${nowMobile}`);

    // Reinitialize balls data
    ballsData = initializeBallsData();

    // Remove old physics bodies
    if (engine && engine.world) {
      const oldBalls = Composite.allBodies(engine.world).filter(body => body.label && body.label.startsWith('ball-'));
      Composite.remove(engine.world, oldBalls);
    }

    // Recreate physics balls
    createPhysicalBalls();

    // Update HTML controls
    setupBallControls();

    // Reassign problems to new balls
    ballsData.forEach(ball => assignNewProblem(ball));
  }
}

// Function to initialize Matter.js
function initPhysics() {
  Engine = Matter.Engine; Runner = Matter.Runner; World = Matter.World;
  Bodies = Matter.Bodies; Composite = Matter.Composite; Constraint = Matter.Constraint;
  Events = Matter.Events; Body = Matter.Body;

  engine = Engine.create();
  engine.world.gravity.y = 0.8;

  // REMOVE OLD GROUND or make it a thin boundary
  // Composite.remove(engine.world, ground); // If 'ground' was added before
  // ground = null; // Or re-purpose ground if needed for edges of screen

  // Create Invisible Keeper Platform - MUCH LARGER to prevent keeper from falling off
  // Position it within the goal, slightly below the visual goal line for perspective.
  // Adjust Y and height based on your goal image and desired perspective.
  const platformY = CANVAS_HEIGHT * 0.6; // Example: 70% down the canvas
  const platformHeight = 40; // Increased height
  const platformWidth = CANVAS_WIDTH * 3; // Much wider than canvas to catch keeper
  keeperPlatform = Bodies.rectangle(CANVAS_WIDTH / 2, platformY, platformWidth, platformHeight, {
    isStatic: true,
    label: 'keeperPlatform',
    render: { visible: false }, // INVISIBLE
    collisionFilter: {
      category: KEEPER_PLATFORM_CATEGORY,
      mask: KEEPER_CATEGORY // Only collides with the keeper
    }
  });
  Composite.add(engine.world, [keeperPlatform]);

  createPhysicalBalls();
  createGoalkeeper(); // Goalkeeper will now stand on keeperPlatform

  runner = Runner.create();
  Runner.run(runner, engine);
  Events.on(engine, 'afterUpdate', gameLoop);
}

function createPhysicalBalls() {
  ballsData.forEach(ballInfo => {
    const ballBody = Bodies.circle(ballInfo.initialX, ballInfo.initialY, BALL_INITIAL_RADIUS, {
      isStatic: true,
      isSensor: true, // Sensor during flight
      restitution: 0.5,
      friction: 0.05,
      label: `ball-${ballInfo.id}`,
      collisionFilter: {
        category: BALL_CATEGORY,
        // Mask: will collide with KEEPER for saves, and DEFAULT for world boundaries
        // For now, let's assume DEFAULT_CATEGORY might represent edges if we add them
        // Balls should NOT collide with KEEPER_PLATFORM
        mask: KEEPER_CATEGORY | DEFAULT_CATEGORY
      },
      renderProps: { fillStyle: '#FFFFFF', strokeStyle: '#333333', lineWidth: 2 }
    });
    ballInfo.matterBody = ballBody;
  });
  Composite.add(engine.world, ballsData.map(b => b.matterBody));
}

function setupBallControls() {
  ballControlsContainer.innerHTML = '';
  ballsData.forEach(ball => {
    const controlDiv = document.createElement('div');
    controlDiv.classList.add('ball-control');
    controlDiv.id = `control-${ball.id}`;

    const problemTextP = document.createElement('p');
    problemTextP.classList.add('problem-text');
    problemTextP.textContent = ball.problemText;

    const shootButton = document.createElement('button');
    shootButton.classList.add('shoot-button');
    shootButton.textContent = 'Shoot';
    shootButton.dataset.ballId = ball.id;

    shootButton.addEventListener('click', () => {
      handleShoot(ball.id);
    });

    controlDiv.appendChild(problemTextP);
    controlDiv.appendChild(shootButton);

    // Add "Next Problem" button for mobile devices
    if (isMobile()) {
      const nextProblemButton = document.createElement('button');
      nextProblemButton.classList.add('shoot-button');
      nextProblemButton.textContent = 'Next Problem';
      nextProblemButton.style.backgroundColor = '#2196F3'; // Blue color to differentiate
      nextProblemButton.style.marginTop = '5px';

      nextProblemButton.addEventListener('click', () => {
        assignNewProblem(ball);
      });

      controlDiv.appendChild(nextProblemButton);
    }

    ballControlsContainer.appendChild(controlDiv);
  });
}

function handleShoot(ballId) {
  const ballInfo = ballsData.find(b => b.id === ballId);
  if (ballInfo && !ballInfo.isShooting) { // Prevent shooting if already in motion
    console.log(`Firing ${ballId} immediately!`);

    // Generate target using probability map that favors corners
    const target = generateShotTarget();

    // Fire immediately - no more queuing!
    ballInfo.isShooting = true;
    ballInfo.currentScale = 1;
    ballInfo.shootTargetX = target.x;
    ballInfo.shootTargetY = target.y;
    ballInfo.shotStartTime = Date.now();

    // Trigger keeper reaction immediately
    keeperAttemptSave(target.x, target.y);
  }
}

function generateShotTarget() {
  // Define goal area boundaries - based on actual goal image size
  const goalCenterX = CANVAS_WIDTH / 2;
  const goalCenterY = CANVAS_HEIGHT * 0.28; // Adjusted to match goal image position

  // Use more conservative goal size for better corner targeting
  const goalWidth = Math.min(CANVAS_WIDTH * 0.3, 350); // Max 350px or 30% of width
  const goalHeight = Math.min(CANVAS_HEIGHT * 0.15, 120); // Max 120px or 15% of height

  const goalLeft = goalCenterX - goalWidth / 2;
  const goalRight = goalCenterX + goalWidth / 2;
  const goalTop = goalCenterY - goalHeight / 2;
  const goalBottom = goalCenterY + goalHeight / 2;

  // Define corner zones (25% chance each corner, 25% chance center area)
  const cornerInfluence = 0.7; // How much to bias toward corners (0-1)
  const random = Math.random();

  let targetX, targetY;

  if (random < 0.25) {
    // Top-left corner
    targetX = goalLeft + (goalWidth * 0.15) * Math.random();
    targetY = goalTop + (goalHeight * 0.3) * Math.random();
  } else if (random < 0.5) {
    // Top-right corner
    targetX = goalRight - (goalWidth * 0.15) * Math.random();
    targetY = goalTop + (goalHeight * 0.3) * Math.random();
  } else if (random < 0.75) {
    // Bottom-left corner
    targetX = goalLeft + (goalWidth * 0.15) * Math.random();
    targetY = goalBottom - (goalHeight * 0.3) * Math.random();
  } else {
    // Bottom-right corner
    targetX = goalRight - (goalWidth * 0.15) * Math.random();
    targetY = goalBottom - (goalHeight * 0.3) * Math.random();
  }

  // Add some randomness to make it less predictable
  const randomness = 15; // pixels of random variation
  targetX += (Math.random() - 0.5) * randomness;
  targetY += (Math.random() - 0.5) * randomness;

  // Ensure target stays within goal bounds
  targetX = Math.max(goalLeft, Math.min(goalRight, targetX));
  targetY = Math.max(goalTop, Math.min(goalBottom, targetY));

  return { x: targetX, y: targetY };
}

// processNextShot function removed - no more queuing!

function createGoalkeeper() {
  // Adjusted initial Y to be higher, assuming platform will be in goal
  const goalFloorY = CANVAS_HEIGHT * 0.5; // Example: platform Y, adjust based on goal image
  const initialX = CANVAS_WIDTH / 2;
  const initialY = goalFloorY - (KEEPER_LOWER_LEG_LENGTH + KEEPER_UPPER_LEG_LENGTH + KEEPER_TORSO_HEIGHT * 0.25); // Position above platform

  const commonBodyOptions = {
    // Keeper parts should collide with the platform and eventually balls.
    // They should NOT collide with each other (due to RAGDOLL_COLLISION_GROUP).
    collisionFilter: {
      group: RAGDOLL_COLLISION_GROUP,
      category: KEEPER_CATEGORY,
      mask: KEEPER_PLATFORM_CATEGORY | BALL_CATEGORY /* | DEFAULT_CATEGORY */ // Add BALL_CATEGORY later for saves
    },
    density: 0.005,
    restitution: 0.1,
    friction: 0.8,
    renderProps: {
      fillStyle: KEEPER_PART_COLOR,
      strokeStyle: KEEPER_STROKE_COLOR,
      lineWidth: 2
    }
  };

  const commonConstraintOptions = {
    stiffness: 0.9,
    damping: 0.2,
    render: { /* visible: true, lineWidth:1, strokeStyle:'#00FF00' */ }
  };

  // --- TORSO ---
  const torso = Bodies.rectangle(initialX, initialY, KEEPER_TORSO_WIDTH, KEEPER_TORSO_HEIGHT, { ...commonBodyOptions, label: "torso" });
  goalkeeper.torso = torso;

  // --- HEAD --- (Adjusted Y slightly)
  const headInitialY = initialY - KEEPER_TORSO_HEIGHT / 2 - KEEPER_HEAD_RADIUS * 0.7;
  const head = Bodies.circle(initialX, headInitialY, KEEPER_HEAD_RADIUS, { ...commonBodyOptions, label: "head" });
  goalkeeper.head = head;
  const neck = Constraint.create({
    bodyA: torso, bodyB: head,
    pointA: { x: 0, y: -KEEPER_TORSO_HEIGHT / 2 },
    pointB: { x: 0, y: KEEPER_HEAD_RADIUS * 0.5 },
    length: 1, stiffness: 0.95, ...commonConstraintOptions
  });

  // --- ARMS --- (Kept previous refinements, ensure collisionFilter is applied)
  const upperArmXOffset = KEEPER_TORSO_WIDTH / 2 + KEEPER_UPPER_ARM_LENGTH / 2 - 2;
  const upperArmY = initialY - KEEPER_TORSO_HEIGHT / 2 + KEEPER_LIMB_WIDTH * 2;

  const upperLeftArm = Bodies.rectangle(initialX - upperArmXOffset, upperArmY, KEEPER_UPPER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "upperLeftArm" });
  goalkeeper.leftArm.upper = upperLeftArm;
  const leftShoulder = Constraint.create({ bodyA: torso, bodyB: upperLeftArm, pointA: { x: -KEEPER_TORSO_WIDTH / 2, y: -KEEPER_TORSO_HEIGHT / 2 + KEEPER_LIMB_WIDTH * 1.5 }, pointB: { x: KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });

  const upperLeftArmEndX = upperLeftArm.position.x - KEEPER_UPPER_ARM_LENGTH / 2 * Math.cos(upperLeftArm.angle);
  const upperLeftArmEndY = upperLeftArm.position.y - KEEPER_UPPER_ARM_LENGTH / 2 * Math.sin(upperLeftArm.angle);
  const lowerLeftArm = Bodies.rectangle(upperLeftArmEndX - KEEPER_LOWER_ARM_LENGTH / 2, upperLeftArmEndY, KEEPER_LOWER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "lowerLeftArm" });
  goalkeeper.leftArm.lower = lowerLeftArm;
  const leftElbow = Constraint.create({ bodyA: upperLeftArm, bodyB: lowerLeftArm, pointA: { x: -KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, pointB: { x: KEEPER_LOWER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });

  const upperRightArm = Bodies.rectangle(initialX + upperArmXOffset, upperArmY, KEEPER_UPPER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "upperRightArm" });
  goalkeeper.rightArm.upper = upperRightArm;
  const rightShoulder = Constraint.create({ bodyA: torso, bodyB: upperRightArm, pointA: { x: KEEPER_TORSO_WIDTH / 2, y: -KEEPER_TORSO_HEIGHT / 2 + KEEPER_LIMB_WIDTH * 1.5 }, pointB: { x: -KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });

  const upperRightArmEndX = upperRightArm.position.x + KEEPER_UPPER_ARM_LENGTH / 2 * Math.cos(upperRightArm.angle);
  const upperRightArmEndY = upperRightArm.position.y + KEEPER_UPPER_ARM_LENGTH / 2 * Math.sin(upperRightArm.angle);
  const lowerRightArm = Bodies.rectangle(upperRightArmEndX + KEEPER_LOWER_ARM_LENGTH / 2, upperRightArmEndY, KEEPER_LOWER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "lowerRightArm" });
  goalkeeper.rightArm.lower = lowerRightArm;
  const rightElbow = Constraint.create({ bodyA: upperRightArm, bodyB: lowerRightArm, pointA: { x: KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, pointB: { x: -KEEPER_LOWER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });


  // --- LEGS ---
  const legYOffset = KEEPER_TORSO_HEIGHT / 2;
  const upperLegX = KEEPER_TORSO_WIDTH / 2; // INCREASED for wider stance (was TORSO_WIDTH / 4)

  // LEFT LEG
  // Try positioning lower leg slightly more "outwards" or give it a slight angle to resist inward collapse
  const upperLeftLegInitialX = initialX - upperLegX;
  const upperLeftLeg = Bodies.rectangle(upperLeftLegInitialX, initialY + legYOffset + KEEPER_UPPER_LEG_LENGTH / 2, KEEPER_LIMB_WIDTH, KEEPER_UPPER_LEG_LENGTH, { ...commonBodyOptions, label: "upperLeftLeg" });
  goalkeeper.leftLeg.upper = upperLeftLeg;
  const leftHip = Constraint.create({
    bodyA: torso, bodyB: upperLeftLeg,
    pointA: { x: -upperLegX * 0.75, y: KEEPER_TORSO_HEIGHT / 2 }, // Adjusted hip joint on torso slightly inwards
    pointB: { x: 0, y: -KEEPER_UPPER_LEG_LENGTH / 2 },
    length: KEEPER_LIMB_WIDTH, stiffness: 0.95, // INCREASED HIP STIFFNESS
    ...commonConstraintOptions // inherits damping
  });

  const lowerLeftLegInitialX = upperLeftLegInitialX - 2; // Slightly offset lower leg outward
  const lowerLeftLeg = Bodies.rectangle(lowerLeftLegInitialX, initialY + legYOffset + KEEPER_UPPER_LEG_LENGTH + KEEPER_LOWER_LEG_LENGTH / 2, KEEPER_LIMB_WIDTH, KEEPER_LOWER_LEG_LENGTH, { ...commonBodyOptions, label: "lowerLeftLeg" });
  goalkeeper.leftLeg.lower = lowerLeftLeg;
  const leftKnee = Constraint.create({
    bodyA: upperLeftLeg, bodyB: lowerLeftLeg,
    pointA: { x: 0, y: KEEPER_UPPER_LEG_LENGTH / 2 },
    pointB: { x: 0, y: -KEEPER_LOWER_LEG_LENGTH / 2 },
    length: 1, stiffness: 0.95, // INCREASED KNEE STIFFNESS
    ...commonConstraintOptions
  });

  // RIGHT LEG (mirror)
  const upperRightLegInitialX = initialX + upperLegX;
  const upperRightLeg = Bodies.rectangle(upperRightLegInitialX, initialY + legYOffset + KEEPER_UPPER_LEG_LENGTH / 2, KEEPER_LIMB_WIDTH, KEEPER_UPPER_LEG_LENGTH, { ...commonBodyOptions, label: "upperRightLeg" });
  goalkeeper.rightLeg.upper = upperRightLeg;
  const rightHip = Constraint.create({
    bodyA: torso, bodyB: upperRightLeg,
    pointA: { x: upperLegX * 0.75, y: KEEPER_TORSO_HEIGHT / 2 },
    pointB: { x: 0, y: -KEEPER_UPPER_LEG_LENGTH / 2 },
    length: KEEPER_LIMB_WIDTH, stiffness: 0.95, // INCREASED HIP STIFFNESS
    ...commonConstraintOptions
  });

  const lowerRightLegInitialX = upperRightLegInitialX + 2; // Slightly offset lower leg outward
  const lowerRightLeg = Bodies.rectangle(lowerRightLegInitialX, initialY + legYOffset + KEEPER_UPPER_LEG_LENGTH + KEEPER_LOWER_LEG_LENGTH / 2, KEEPER_LIMB_WIDTH, KEEPER_LOWER_LEG_LENGTH, { ...commonBodyOptions, label: "lowerRightLeg" });
  goalkeeper.rightLeg.lower = lowerRightLeg;
  const rightKnee = Constraint.create({
    bodyA: upperRightLeg, bodyB: lowerRightLeg,
    pointA: { x: 0, y: KEEPER_UPPER_LEG_LENGTH / 2 },
    pointB: { x: 0, y: -KEEPER_LOWER_LEG_LENGTH / 2 },
    length: 1, stiffness: 0.95, // INCREASED KNEE STIFFNESS
    ...commonConstraintOptions
  });

  goalkeeper.bodies.length = 0; goalkeeper.constraints.length = 0;
  goalkeeper.bodies.push(torso, head, upperLeftArm, lowerLeftArm, upperRightArm, lowerRightArm, upperLeftLeg, lowerLeftLeg, upperRightLeg, lowerRightLeg);
  goalkeeper.constraints.push(neck, leftShoulder, leftElbow, rightShoulder, rightElbow, leftHip, leftKnee, rightHip, rightKnee);

  Composite.add(engine.world, goalkeeper.bodies);
  Composite.add(engine.world, goalkeeper.constraints);
}

function showSpeechBubble(text) {
  speechBubble.text = text;
  speechBubble.isVisible = true;
  speechBubble.targetOpacity = 1;
  speechBubble.showStartTime = Date.now();
  console.log(`Showing speech bubble: "${text}"`);
}

function hideSpeechBubble() {
  speechBubble.targetOpacity = 0;
  // Note: isVisible will be set to false when opacity reaches 0 in the update loop
}

function assignNewProblem(ballInfo) {
  // Get a new random problem from the list
  const newProblemData = problemSolutionList[problemCycleIndex % problemSolutionList.length];
  ballInfo.problemText = newProblemData.problem;
  ballInfo.solutionText = newProblemData.solution;
  problemCycleIndex++;

  // Update the corresponding HTML control
  updateBallControl(ballInfo);

  console.log(`Assigned new problem to ${ballInfo.id}: "${ballInfo.problemText}"`);
}

function updateBallControl(ballInfo) {
  const controlDiv = document.getElementById(`control-${ballInfo.id}`);
  if (controlDiv) {
    const problemTextElement = controlDiv.querySelector('.problem-text');
    if (problemTextElement) {
      problemTextElement.textContent = ballInfo.problemText;
    }
  }
}

function keeperAttemptSave(targetX, targetY) {
  if (!goalkeeper.torso) return; // Can't do anything if there's no keeper

  // For multiple simultaneous balls, calculate the "center of action"
  const activeBalls = ballsData.filter(ball => ball.isShooting);

  let centerX = targetX;
  let centerY = targetY;
  let ballToSave = activeBalls.find(ball =>
    ball.shootTargetX === targetX && ball.shootTargetY === targetY
  ) || activeBalls[0]; // Find the specific ball or use first active ball

  if (activeBalls.length > 1) {
    // Calculate center of mass of all active targets
    centerX = activeBalls.reduce((sum, ball) => sum + ball.shootTargetX, 0) / activeBalls.length;
    centerY = activeBalls.reduce((sum, ball) => sum + ball.shootTargetY, 0) / activeBalls.length;
    console.log(`Multiple balls detected! Keeper aiming for center: (${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);
  }

  // Set keeper state - always update to latest/center target
  goalkeeper.isSaving = true;
  goalkeeper.reachTarget = { x: centerX, y: centerY };

  // Decide which hand to use based on center target's X position
  if (centerX < goalkeeper.torso.position.x) {
    goalkeeper.reachingHand = goalkeeper.leftArm.lower; // Reach with left hand
  } else {
    goalkeeper.reachingHand = goalkeeper.rightArm.lower; // Reach with right hand
  }

  // 🎬 DETERMINE SAVE ANIMATION TYPE
  determineSaveAnimation(centerX, centerY);

  // 🎯 CALCULATE REALISTIC KEEPER TIMING
  calculateKeeperTiming(centerX, centerY, ballToSave);
}

function calculateKeeperTiming(targetX, targetY, ballToSave) {
  if (!goalkeeper.torso || !ballToSave || !ballToSave.matterBody) return;

  const keeperPosition = goalkeeper.torso.position;
  const ballPosition = ballToSave.matterBody.position;

  // 1. Calculate how long ball will take to reach target
  const ballToTargetDistance = Math.sqrt(
    (targetX - ballPosition.x) ** 2 +
    (targetY - ballPosition.y) ** 2
  );
  const ballSpeed = 5; // pixels per frame (same as animation speed)
  const ballTimeToTarget = ballToTargetDistance / ballSpeed; // frames until ball arrives

  // 2. Calculate keeper distance to target
  const keeperToTargetDistance = Math.sqrt(
    (targetX - keeperPosition.x) ** 2 +
    (targetY - keeperPosition.y) ** 2
  );

  // 3. Calculate required keeper speed to arrive at same time
  const requiredKeeperSpeed = keeperToTargetDistance / ballTimeToTarget;

  // 4. Convert to force (physics calculation)
  // Scale force based on distance and time - more realistic
  const baseForce = 0.01; // Base force multiplier
  const urgencyMultiplier = Math.min(ballTimeToTarget / 30, 2); // More urgent if ball arrives soon
  const distanceMultiplier = Math.min(keeperToTargetDistance / 100, 3); // More force for farther saves

  const forceStrength = baseForce * urgencyMultiplier * distanceMultiplier;

  // 5. Apply force in direction of target
  const vectorToTarget = {
    x: targetX - keeperPosition.x,
    y: targetY - keeperPosition.y
  };

  const distance = Math.sqrt(vectorToTarget.x ** 2 + vectorToTarget.y ** 2);
  if (distance === 0) return;

  const normalizedVector = {
    x: vectorToTarget.x / distance,
    y: vectorToTarget.y / distance
  };

  const force = {
    x: normalizedVector.x * forceStrength,
    y: normalizedVector.y * forceStrength
  };

  // Apply the calculated force
  Body.applyForce(goalkeeper.torso, keeperPosition, force);

  console.log(`Keeper timing: Ball ETA ${ballTimeToTarget.toFixed(1)} frames, keeper distance ${keeperToTargetDistance.toFixed(1)}px, force strength ${forceStrength.toFixed(4)}`);
}

// OUR CUSTOM GAME LOOP / RENDERER
function gameLoop() {
  // 1. Clear the canvas
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2. Draw background elements (e.g., sky if not part of goal image)
  ctx.fillStyle = '#e0f7fa'; // Light blue sky
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 3. Draw the goal image - responsive sizing with preserved aspect ratio
  if (goalImageLoaded) {
    // Preserve goal's natural aspect ratio
    const goalNaturalAspect = goalImage.width / goalImage.height;
    const maxGoalWidth = CANVAS_WIDTH * 0.4; // Max 40% of canvas width
    const maxGoalHeight = CANVAS_HEIGHT * 0.25; // Max 25% of canvas height

    // Calculate size maintaining aspect ratio
    let goalDrawWidth = maxGoalWidth;
    let goalDrawHeight = goalDrawWidth / goalNaturalAspect;

    // If height is too big, constrain by height instead
    if (goalDrawHeight > maxGoalHeight) {
      goalDrawHeight = maxGoalHeight;
      goalDrawWidth = goalDrawHeight * goalNaturalAspect;
    }

    const goalDrawX = (CANVAS_WIDTH - goalDrawWidth) / 2;
    const goalDrawY = CANVAS_HEIGHT * 0.15; // 15% from top
    ctx.drawImage(goalImage, goalDrawX, goalDrawY, goalDrawWidth, goalDrawHeight);
  } else {
    // Fallback if image not loaded - also responsive
    const fallbackWidth = CANVAS_WIDTH * 0.3;
    const fallbackHeight = CANVAS_HEIGHT * 0.15;
    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect((CANVAS_WIDTH - fallbackWidth) / 2, CANVAS_HEIGHT * 0.15, fallbackWidth, fallbackHeight);
    ctx.fillStyle = 'black';
    ctx.fillText("Goal Loading...", CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.2);
  }

  // 4. Animate and Draw Balls
  ballsData.forEach(ballInfo => {
    const body = ballInfo.matterBody;
    if (!body) return;

    if (ballInfo.isShooting) {
      // Animate ball towards target (perspective shot)
      const targetX = ballInfo.shootTargetX;
      const targetY = ballInfo.shootTargetY;
      const currentX = body.position.x;
      const currentY = body.position.y;

      const dx = targetX - currentX;
      const dy = targetY - currentY;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);

      const animationSpeed = 5; // Pixels per frame, adjust for desired speed

      if (distanceToTarget < animationSpeed) {
        // Reached save point - this is the "SAVE" moment
        Body.setPosition(body, { x: targetX, y: targetY });
        ballInfo.isShooting = false;
        ballInfo.currentScale = BALL_MIN_SCALE;
        ballInfo.shotStartTime = 0; // Clear shot timing

        console.log(`${ballInfo.id} reached save point. Keeper made the save!`);

        // Create particle effect at the save moment!
        createAerialAdjustmentEffect(targetX, targetY);
        console.log('Save completed! Particle effect triggered at save point.');

        // Show speech bubble with the solution for this problem
        showSpeechBubble(ballInfo.solutionText);

        // --- ROBUST DEFLECTION LOGIC ---
        Body.setStatic(body, false);
        body.isSensor = false;

        // Reset ball's velocity to 0 before we apply new forces
        Body.setVelocity(body, { x: 0, y: 0 });

        // 1. Calculate a reliable "punch" direction away from the keeper
        const keeperPosition = goalkeeper.torso.position;
        const ballPosition = body.position;
        let punchVector = {
          x: ballPosition.x - keeperPosition.x,
          y: ballPosition.y - keeperPosition.y
        };
        // Normalize the punch vector
        const punchMagnitude = Math.sqrt(punchVector.x * punchVector.x + punchVector.y * punchVector.y);
        if (punchMagnitude > 0) {
          punchVector.x /= punchMagnitude;
          punchVector.y /= punchMagnitude;
        } else {
          // Fallback if keeper and ball are at the exact same spot
          punchVector = { x: (Math.random() - 0.5), y: -1 };
        }


        // 2. Create a base deflection force + add keeper's velocity as a bonus
        // The user's tuned value (0.6) was probably high because velocity was low.
        // Let's start with a reasonable base and smaller multiplier.
        const deflectionForceMagnitude = 0.01; // Base strength of the "punch"
        const keeperVelocityInfluence = 0.1; // How much keeper's motion adds

        const deflectionForce = {
          x: punchVector.x * deflectionForceMagnitude + (goalkeeper.torso.velocity.x * keeperVelocityInfluence),
          y: punchVector.y * deflectionForceMagnitude - 0.03 // Add a consistent upward pop
        };

        Body.applyForce(body, body.position, deflectionForce);

        // Reset the keeper's AI state
        goalkeeper.isSaving = false;
        goalkeeper.reachTarget = null;
        goalkeeper.reachingHand = null;
        // Return to ragdoll mode after save
        goalkeeper.animationState = 'ragdoll';
        goalkeeper.animationStartTime = 0;

        // 3. Temporarily disable collision between ball and keeper to prevent tangling
        body.collisionFilter.group = RAGDOLL_COLLISION_GROUP;

        // 4. Re-enable collision after a short delay
        setTimeout(() => {
          // Make sure the body still exists before trying to modify it
          if (body) {
            body.collisionFilter.group = 0; // 0 is the default group, collides with everything
          }
        }, 500); // 500ms = half a second

        // No more queue processing needed!

      } else {
        // Move towards target
        const angle = Math.atan2(dy, dx);
        const newX = currentX + Math.cos(angle) * animationSpeed;
        const newY = currentY + Math.sin(angle) * animationSpeed;
        Body.setPosition(body, { x: newX, y: newY });

        // Update scale for perspective:
        // Simple linear interpolation of scale from 1 (at start) to ~0.3 (at target)
        // Let initial distance be D_initial, current distance from start be D_current
        // Scale = 1 - (D_current / D_initial) * (1 - minScale)
        // For simplicity: scale based on distance to target (larger when far, smaller when near)
        // This needs a reference starting distance.
        // Let's use a simpler approach for now: scale decreases as Y decreases (goes "up" the screen)
        const totalTravelY = ballInfo.initialY - targetY;
        const travelledY = ballInfo.initialY - newY;
        if (totalTravelY > 0) {
          const progress = Math.max(0, Math.min(1, travelledY / totalTravelY));
          // CHANGE IS HERE: use BALL_MIN_SCALE
          ballInfo.currentScale = 1 - progress * (1 - BALL_MIN_SCALE);
        }
      }
    }

    // Draw the ball using its current scale
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, BALL_INITIAL_RADIUS * ballInfo.currentScale, 0, Math.PI * 2);
    ctx.fillStyle = body.renderProps.fillStyle;
    ctx.fill();
    ctx.strokeStyle = body.renderProps.strokeStyle;
    ctx.lineWidth = body.renderProps.lineWidth;
    ctx.stroke();
    ctx.closePath();

    // Ball reset bounds - generous but not too generous
    const boundaryBuffer = 150; // Fixed buffer to avoid confusion
    const isOutOfYBounds = body.position.y > CANVAS_HEIGHT + boundaryBuffer || body.position.y < -50;
    const isOutOfXBounds = body.position.x > CANVAS_WIDTH + boundaryBuffer || body.position.x < -boundaryBuffer;

    if (!ballInfo.isShooting && (isOutOfYBounds || isOutOfXBounds)) {
      console.log(`Resetting ${ballInfo.id}`);
      // Reset physics state
      Body.setStatic(body, true);
      body.isSensor = true;
      Body.setPosition(body, { x: ballInfo.initialX, y: ballInfo.initialY });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngle(body, 0);
      Body.setAngularVelocity(body, 0);

      // Reset visual/game state
      ballInfo.currentScale = 1;
      ballInfo.shotStartTime = 0; // Clear shot timing

      // Get new problem for this ball
      assignNewProblem(ballInfo);
    }
  });

  // 5. Draw static elements like ground (if needed, or part of background image)
  /*
  if (ground) { // Ground still exists as a physics body
    ctx.beginPath();
    // ground.vertices contains the points of the rectangle
    ctx.moveTo(ground.vertices[0].x, ground.vertices[0].y);
    for (let j = 1; j < ground.vertices.length; j += 1) {
      ctx.lineTo(ground.vertices[j].x, ground.vertices[j].y);
    }
    ctx.closePath();
    ctx.fillStyle = ground.render.fillStyle;
    ctx.fill();
  }
  */

  // 6. UPDATE KEEPER AI (e.g., Arm Stretching) - Simplified
  if (goalkeeper.isSaving && goalkeeper.reachTarget && goalkeeper.reachingHand) {
    const hand = goalkeeper.reachingHand;
    const target = goalkeeper.reachTarget;

    // Apply a gentle, continuous force to pull the hand towards the target
    const vectorToTarget = {
      x: target.x - hand.position.x,
      y: target.y - hand.position.y
    };

    const reachForce = {
      x: vectorToTarget.x * KEEPER_ARM_REACH_FORCE,
      y: vectorToTarget.y * KEEPER_ARM_REACH_FORCE
    };

    // Apply force to the "hand" (lower arm part)
    Body.applyForce(hand, hand.position, reachForce);
  }

  // 6.1 KEEPER STANDING/RECOVERY FORCES
  applyStandingForces();

  // 6.2 ANTI-SPIN STABILIZATION - Prevent crazy spinning
  preventKeeperSpinning();

  // 6.3 ANIMATION STATE MANAGEMENT - Return to ragdoll after animation
  updateAnimationState();

  // 6.1 UPDATE SPEECH BUBBLE
  if (speechBubble.isVisible) {
    // Update opacity for fade in/out animation
    if (speechBubble.opacity < speechBubble.targetOpacity) {
      speechBubble.opacity = Math.min(speechBubble.targetOpacity, speechBubble.opacity + speechBubble.fadeSpeed);
    } else if (speechBubble.opacity > speechBubble.targetOpacity) {
      speechBubble.opacity = Math.max(speechBubble.targetOpacity, speechBubble.opacity - speechBubble.fadeSpeed);
    }

    // Check if we should start fading out
    if (speechBubble.targetOpacity === 1 && Date.now() - speechBubble.showStartTime > speechBubble.displayDuration) {
      hideSpeechBubble();
    }

    // Hide when fully faded out
    if (speechBubble.opacity <= 0 && speechBubble.targetOpacity === 0) {
      speechBubble.isVisible = false;
    }
  }

  // 6.2 UPDATE PARTICLES
  particles.forEach(particle => particle.update());
  particles = particles.filter(particle => !particle.isDead());

  // 6.3 CHECK GOALKEEPER BOUNDS
  checkGoalkeeperBounds();

  // 6.4 CHECK FOR STUCK BALLS
  checkStuckBalls();

  // 7. Draw goalkeeper
  goalkeeper.bodies.forEach(body => {
    ctx.beginPath();
    // Assuming all keeper parts are rectangles for now, except head
    if (body.label === "head") {
      ctx.arc(body.position.x, body.position.y, KEEPER_HEAD_RADIUS, 0, Math.PI * 2);
    } else {
      // Draw rectangles based on their vertices
      ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
      for (let j = 1; j < body.vertices.length; j += 1) {
        ctx.lineTo(body.vertices[j].x, body.vertices[j].y);
      }
      ctx.closePath();
    }
    ctx.fillStyle = body.renderProps.fillStyle; // Use renderProps we defined
    ctx.strokeStyle = body.renderProps.strokeStyle;
    ctx.lineWidth = body.renderProps.lineWidth;
    ctx.fill();
    ctx.stroke();
  });

  // 7.1 Draw custom images on goalkeeper body parts
  drawKeeperCustomizations();

  // 8. Draw speech bubble
  if (speechBubble.isVisible && speechBubble.opacity > 0 && goalkeeper.head) {
    const headPos = goalkeeper.head.position;

    // Position bubble above and to the side of the head
    const bubbleX = headPos.x + 30;
    const bubbleY = headPos.y - 40;
    const bubbleWidth = 180;
    const bubbleHeight = 60;
    const cornerRadius = 8;

    // Set opacity for fade effect
    ctx.globalAlpha = speechBubble.opacity;

    // Draw bubble background
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;

    // Draw rounded rectangle for bubble
    ctx.beginPath();
    ctx.moveTo(bubbleX + cornerRadius, bubbleY);
    ctx.arcTo(bubbleX + bubbleWidth, bubbleY, bubbleX + bubbleWidth, bubbleY + cornerRadius, cornerRadius);
    ctx.arcTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight, bubbleX + bubbleWidth - cornerRadius, bubbleY + bubbleHeight, cornerRadius);
    ctx.arcTo(bubbleX, bubbleY + bubbleHeight, bubbleX, bubbleY + bubbleHeight - cornerRadius, cornerRadius);
    ctx.arcTo(bubbleX, bubbleY, bubbleX + cornerRadius, bubbleY, cornerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw speech bubble tail pointing to head
    ctx.beginPath();
    ctx.moveTo(bubbleX, bubbleY + bubbleHeight / 2);
    ctx.lineTo(headPos.x + 10, headPos.y - 5);
    ctx.lineTo(bubbleX, bubbleY + bubbleHeight / 2 + 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw text
    ctx.fillStyle = '#333333';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wrap text if too long
    const words = speechBubble.text.split(' ');
    const lines = [];
    let currentLine = '';
    const maxWidth = bubbleWidth - 20; // Padding

    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    // Draw each line
    const lineHeight = 14;
    const textStartY = bubbleY + bubbleHeight / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, index) => {
      ctx.fillText(line, bubbleX + bubbleWidth / 2, textStartY + index * lineHeight);
    });

    // Reset global alpha
    ctx.globalAlpha = 1;
  }

  // 9. Draw particles (visual effects)
  if (particles.length > 0) {
    // Debug: Log particle count occasionally
    if (Math.random() < 0.1) { // 10% chance to log
      console.log(`Drawing ${particles.length} particles`);
    }
  }
  particles.forEach(particle => particle.draw(ctx));

  // 10. Draw other UI elements
}


// Initialization
window.addEventListener('resize', () => {
  resizeCanvas();
  handleResize();
});

function initializeScene() {
  ballsData.forEach((ball) => {
    const problemData = problemSolutionList[problemCycleIndex % problemSolutionList.length];
    ball.problemText = problemData.problem;
    ball.solutionText = problemData.solution;
    problemCycleIndex++;
  });

  resizeCanvas(); // Set canvas size first
  initPhysics();  // Setup Matter.js
  setupBallControls(); // Create HTML controls
  setupMouseInteraction(); // Enable draggable keeper
  // gameLoop is now started by Events.on(engine, 'afterUpdate', gameLoop);
}

function setupMouseInteraction() {
  // Mouse events
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp); // Stop dragging if mouse leaves canvas

  // Touch events for mobile
  canvas.addEventListener('touchstart', (evt) => {
    evt.preventDefault();
    const touch = evt.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    handleMouseDown(mouseEvent);
  });

  canvas.addEventListener('touchmove', (evt) => {
    evt.preventDefault();
    const touch = evt.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    handleMouseMove(mouseEvent);
  });

  canvas.addEventListener('touchend', (evt) => {
    evt.preventDefault();
    handleMouseUp(evt);
  });

  console.log('Mouse interaction setup complete - keeper is now draggable!');
}

initializeScene();

console.log('Switched to custom rendering loop.');
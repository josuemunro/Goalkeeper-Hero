// Get the canvas element
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d'); // We WILL use this extensively now
const ballControlsContainer = document.getElementById('ball-controls-container');

// Define the canvas dimensions
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 450;

// Matter.js Modules
let Engine, Runner, World, Bodies, Composite, Constraint, Events, Body;

// Game element properties
const BALL_RADIUS = 15; // Initial visual radius on canvas
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
  rightLeg: { upper: null, lower: null }
};

// Collision group for ragdoll parts to prevent self-collision
const RAGDOLL_COLLISION_GROUP = Matter.Body.nextGroup(true); // Use a unique negative group

// Store physics bodies and game state
let physicalBalls = [];
let ground;
let keeperPlatform;

let ballsData = [
  { id: 'ball1', problemText: "", initialX: CANVAS_WIDTH / 2 - 100, initialY: CANVAS_HEIGHT - 60, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1 },
  { id: 'ball2', problemText: "", initialX: CANVAS_WIDTH / 2, initialY: CANVAS_HEIGHT - 60, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1 },
  { id: 'ball3', problemText: "", initialX: CANVAS_WIDTH / 2 + 100, initialY: CANVAS_HEIGHT - 60, solutionText: "", matterBody: null, isShooting: false, shootTargetX: 0, shootTargetY: 0, currentScale: 1 }
];

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

// Function to set canvas size
function resizeCanvas() {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  // No Matter.Render to update, our custom draw will use these dimensions
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

  // Create Invisible Keeper Platform
  // Position it within the goal, slightly below the visual goal line for perspective.
  // Adjust Y and height based on your goal image and desired perspective.
  const platformY = CANVAS_HEIGHT * 0.6; // Example: 70% down the canvas
  const platformHeight = 20;
  keeperPlatform = Bodies.rectangle(CANVAS_WIDTH / 2, platformY, GOAL_WIDTH * 1.2, platformHeight, { // Slightly wider than goal
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
      const ballBody = Bodies.circle(ballInfo.initialX, ballInfo.initialY, BALL_RADIUS, {
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
    ballControlsContainer.appendChild(controlDiv);
  });
}

function handleShoot(ballId) {
  const ballInfo = ballsData.find(b => b.id === ballId);
  if (ballInfo && !ballInfo.isShooting) { // Prevent shooting if already in motion
    console.log(`Shooting ${ballId}`);
    ballInfo.isShooting = true;
    ballInfo.currentScale = 1; // Reset scale

    // Define a target for the shot (e.g., center of goal area)
    // For now, a fixed point. Later, random within goal with probability map.
    // Goal area visual center (approximate, adjust based on your goal image)
    const goalVisualCenterY = CANVAS_HEIGHT * 0.35; // Example Y
    const goalVisualWidth = 200; // Example visual width of goal mouth
    ballInfo.shootTargetX = CANVAS_WIDTH / 2 + (Math.random() - 0.5) * goalVisualWidth * 0.8;
    ballInfo.shootTargetY = goalVisualCenterY;

    // The actual animation will happen in gameLoop
  }
}

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

  const upperLeftArmEndX = upperLeftArm.position.x - KEEPER_UPPER_ARM_LENGTH / 2 * Math.cos(upperLeftArm.angle) ;
  const upperLeftArmEndY = upperLeftArm.position.y - KEEPER_UPPER_ARM_LENGTH / 2 * Math.sin(upperLeftArm.angle) ;
  const lowerLeftArm = Bodies.rectangle(upperLeftArmEndX - KEEPER_LOWER_ARM_LENGTH / 2, upperLeftArmEndY, KEEPER_LOWER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "lowerLeftArm" });
  goalkeeper.leftArm.lower = lowerLeftArm;
  const leftElbow = Constraint.create({ bodyA: upperLeftArm, bodyB: lowerLeftArm, pointA: { x: -KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, pointB: { x: KEEPER_LOWER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });

  const upperRightArm = Bodies.rectangle(initialX + upperArmXOffset, upperArmY, KEEPER_UPPER_ARM_LENGTH, KEEPER_LIMB_WIDTH, { ...commonBodyOptions, label: "upperRightArm" });
  goalkeeper.rightArm.upper = upperRightArm;
  const rightShoulder = Constraint.create({ bodyA: torso, bodyB: upperRightArm, pointA: { x: KEEPER_TORSO_WIDTH / 2, y: -KEEPER_TORSO_HEIGHT / 2 + KEEPER_LIMB_WIDTH * 1.5 }, pointB: { x: -KEEPER_UPPER_ARM_LENGTH / 2, y: 0 }, length: KEEPER_LIMB_WIDTH / 2, ...commonConstraintOptions });

  const upperRightArmEndX = upperRightArm.position.x + KEEPER_UPPER_ARM_LENGTH / 2 * Math.cos(upperRightArm.angle) ;
  const upperRightArmEndY = upperRightArm.position.y + KEEPER_UPPER_ARM_LENGTH / 2 * Math.sin(upperRightArm.angle) ;
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

// OUR CUSTOM GAME LOOP / RENDERER
function gameLoop() {
  // 1. Clear the canvas
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 2. Draw background elements (e.g., sky if not part of goal image)
  ctx.fillStyle = '#e0f7fa'; // Light blue sky
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 3. Draw the goal image
  if (goalImageLoaded) {
    // Adjust x, y, width, height as needed to position and scale your goal image
    // Example: Center the image, assuming its natural width is similar to GOAL_WIDTH
    const goalDrawWidth = 250; // Or goalImage.width if you want natural size
    const goalDrawHeight = 125; // Or goalImage.height
    const goalDrawX = (CANVAS_WIDTH - goalDrawWidth) / 2;
    // Position it towards the top, an example:
    const goalDrawY = CANVAS_HEIGHT * 0.2;
    ctx.drawImage(goalImage, goalDrawX, goalDrawY, goalDrawWidth, goalDrawHeight);
  } else {
    // Fallback if image not loaded
    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect((CANVAS_WIDTH - 200) / 2, CANVAS_HEIGHT * 0.2, 200, 100);
    ctx.fillStyle = 'black';
    ctx.fillText("Goal Loading...", CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.2 + 50);
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
        // Reached target (or close enough) - this is the "SAVE" moment
        Body.setPosition(body, { x: targetX, y: targetY }); // Snap to exact target
        ballInfo.isShooting = false;
        ballInfo.currentScale = 0.3; // Smallest size at goal

        console.log(`${ballInfo.id} reached save point. Deflecting (simulated).`);
        // TODO: Keeper interaction here. For now, make it dynamic and apply a random upward force.
        Body.setStatic(body, false); // Make it dynamic
        body.isSensor = false;       // Allow collisions

        Body.setVelocity(body, { x: 0, y: 0 }); // Reset velocity before applying new force
        Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.1, // Random horizontal deflection
          y: -0.05 // Upward deflection
        });

        // TODO: Replace problem text on this ball for the next shot.
        // TODO: Show speech bubble with solution.

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
        if (totalTravelY > 0) { // Avoid division by zero, ensure moving towards target
          const progress = Math.max(0, Math.min(1, travelledY / totalTravelY));
          ballInfo.currentScale = 1 - progress * 0.7; // Scale from 1 down to 0.3
        }
      }
    }

    // Draw the ball using its current scale
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, BALL_RADIUS * ballInfo.currentScale, 0, Math.PI * 2);
    ctx.fillStyle = body.renderProps.fillStyle;
    ctx.fill();
    ctx.strokeStyle = body.renderProps.strokeStyle;
    ctx.lineWidth = body.renderProps.lineWidth;
    ctx.stroke();
    ctx.closePath();

    // If ball flies off screen, reset it (basic reset logic for now)
    if (!ballInfo.isShooting && body.position.y > CANVAS_HEIGHT + BALL_RADIUS * 2) {
      Body.setStatic(body, true);
      body.isSensor = true;
      Body.setPosition(body, { x: ballInfo.initialX, y: ballInfo.initialY });
      Body.setVelocity(body, { x: 0, y: 0 }); // Reset velocity
      Body.setAngle(body, 0); // Reset angle
      ballInfo.currentScale = 1; // Reset scale
      // TODO: Get new problem for this ball.
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

  // 6. Draw goalkeeper
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

  // 7. Draw UI elements like speech bubble (later)
}


// Initialization
window.addEventListener('resize', resizeCanvas);

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
  // gameLoop is now started by Events.on(engine, 'afterUpdate', gameLoop);
}

initializeScene();

console.log('Switched to custom rendering loop.');
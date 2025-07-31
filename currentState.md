### Where We're At: Project Summary

We've successfully built the core physics and interaction model for the ragdoll goalkeeper. The foundation is strong and incorporates several key decisions from the brief.

**1. Rendering & Physics Engine:**

- We're using **Matter.js** for the 2D physics simulation.
- Crucially, we moved away from the default Matter.js renderer to a **custom rendering loop** (`gameLoop`) that uses the **HTML5 Canvas API**. This gives us full control to draw custom elements like the goal image and implement unique visual effects like perspective scaling.

**2. The Goalkeeper:**

- He is a fully functional, **multi-part ragdoll** constructed from various Matter.js bodies (head, torso, limbs) connected by constraints (joints).
- He has a persistent "heap of limbs" charm, which we've decided is a feature for now! His joints are tuned for stability but still allow for chaotic, funny ragdoll motion.
- He stands on an **invisible platform** within the goal area. We used **collision filtering** so that only he can interact with this platform, while the balls will pass right through it.

**3. The Ball & Shooting Mechanic:**

- The ball's flight path is a **controlled animation**, not a pure physics simulation. When shot, the ball travels towards a target point while visually shrinking to create a **3D perspective effect**.
- Only after the ball is "saved" does it become a fully dynamic physics object, allowing it to be deflected realistically.
- The problem labels and "Shoot" buttons are **HTML elements** outside the canvas, which allows for easy styling and event handling.

**4. The Saving Mechanic (The Core AI):**

- This is the most recently completed feature. When a ball is shot:
    - The keeper's **torso** is propelled towards the interception point by a physics force.
    - His **arms actively stretch** towards the ball. This is achieved by applying a separate, gentle force to the appropriate hand, pulling it towards the target.
    - The **ball deflection is dynamic**, calculated based on the keeper's position relative to the ball, creating a believable "punch" or "save" effect.
    - The ball and keeper are temporarily made non-collidable right after a save to prevent them from getting tangled.

---

### What's Next: The To-Do List

Now we move from the core physics mechanics to the features that deliver the project's main goal: displaying the "problem/solution" information. Here are the remaining tasks, in a logical order.

**1. Problem & Solution Display (Highest Priority):**

- **Speech Bubble Logic:** When a save is completed, we need to create and display a speech bubble near the goalkeeper's head.
- **Content:** The bubble must display the `solutionText` corresponding to the `problemText` of the saved ball. This data is already in our `ballsData` objects.
- **Rendering & Positioning:** We need to decide how to draw the speech bubble (on the canvas or as an HTML overlay). It should remain positioned relative to the keeper's head *without* being affected by the ragdoll's rotation.
- **Animation:** The speech bubble should fade in, stay visible for 3-5 seconds, and then fade out.

**2. Shot Queuing & Problem Cycling:**

- **Shot Queue:** Implement a queue to handle multiple shots fired in rapid succession. The keeper should finish one save before starting the next.
- **Rapid Save Message:** If multiple saves are queued, the speech bubble should display the special message: `"Ahhh, give me time to answer the problem!"` as per the brief.
- **Problem Replacement:** After a ball is saved and reset, its problem and solution text must be updated with a new, random entry from the `problemSolutionList`. The corresponding HTML control below the canvas must also be updated.

**3. Visual Polish & Customization:**

- **Goalkeeper Sprites:** Implement the ability to overlay custom images (e.g., a headshot, jersey, gloves) onto the corresponding ragdoll body parts. This involves drawing the image at the position and angle of the Matter.js body in our `gameLoop`.
- **Visual Effects:** Add the non-physics "explosive visual effect" mentioned in the brief for when the keeper makes an aerial adjustment. This would likely be a small particle animation.

**4. Mobile Responsiveness:**

- The brief requires a different layout for mobile (e.g., `< 480px`), showing only one ball at a time.
- We'll need to add logic to detect the screen size and dynamically adjust the `ballsData` array and the HTML controls to show one ball instead of three.
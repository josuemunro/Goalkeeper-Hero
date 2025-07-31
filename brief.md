## Project Title: Interactive Ragdoll Goalkeeper Hero Element

**1. Introduction & Objective:**

To develop an engaging and interactive HTML5 canvas-based hero element for a Webflow Development agency's homepage. The interactive element will feature a ragdoll goalkeeper saving footballs, where each ball represents a common Webflow limitation/problem. When a ball is "shot" and subsequently "saved," the goalkeeper will provide the corresponding solution via a speech bubble. The primary goal is to create a fun, memorable, and informative user experience that subtly highlights the agency's problem-solving expertise.

**2. Core Concept:**

Users are presented with a scene featuring a football goal, a ragdoll goalkeeper, and a lineup of three (or one on mobile) footballs. Each ball is labeled with a common Webflow problem. Users can click a "shoot" button associated with each ball. Upon shooting, the ball travels towards the goal, and the ragdoll goalkeeper dynamically moves to "save" it. After a successful save, the ball is deflected out of view, the problem text on the ball is replaced with a new one from a predefined list, and the goalkeeper displays the solution to the saved problem in a speech bubble.

**3. Key Features & Mechanics:**

**3.1. Scene Setup:**
* **Canvas:** The interactive element will reside within an HTML canvas. The canvas should be responsive.
* Desktop/Tablet: The main interactive area (goal, keeper, initial ball positions) should aim for a width of around `600px` (or `100%` of its parent container if smaller, scaling down proportionally). It could be, for example, `40%` of a larger hero section's width.
* Mobile (e.g., < 480px width): The layout should adapt, potentially showing only one ball at a time.
* **Goal:** A simple representation of a football goal.
* **Ragdoll Goalkeeper:**
* Constructed with 8 pivot points (shoulders, elbows, hips, knees) for realistic ragdoll physics.
* Initial appearance can be a stick man, but with the ability to easily overlay custom sprites for the head (client's headshot) and goalkeeper attire (jersey, gloves) onto the respective body parts.
* Positioned in the center of the goal.
* **Footballs:**
* Three balls lined up in front of the goal on desktop/tablet.
* One ball displayed on mobile screens (< 480px).
* Each ball displays a text label representing a Webflow problem (e.g., "Only one nested CMS collection per page").
* A "Shoot" button is located beneath each visible ball.

**3.2. Ball Interaction & Shooting:**
* **Shooting:** When a "Shoot" button is clicked:
* The corresponding ball is propelled towards a random location within the goal area.
* **Perspective:** As the ball travels towards the goal, it should visually shrink to simulate perspective.
* **Shot Trajectory Probability:** Implement a probability map for the shot's target location within the goal, increasing the chances of shots going towards the four corners.
* **Problem Replacement:** After a ball is shot (and subsequently saved), it should be replaced by a new ball featuring a different random problem from a predefined list/array.

**3.3. Goalkeeper Mechanics & Saving:**
* **Saving Logic:** The goalkeeper *always* saves the shot, regardless of its destination or if multiple balls are shot in quick succession.
* **Ragdoll Animation:**
* When a ball is shot, the ragdoll goalkeeper should dynamically react, "jumping" or moving towards the ball to make the save.
* The movement should be physics-driven. Calculate the necessary force/vector for the keeper to intercept the ball just in time.
* If the keeper is already moving for a previous shot, the new force should be applied to adjust its trajectory.
* Arms should appear to stretch towards the ball as it gets close to the save point.
* Legs should ideally be the source of jumping force if on the ground. If in the air, a small "explosive" visual effect (non-physics impacting, just visual) could suggest an aerial adjustment.
* **Shot Queuing:** Implement a system to handle multiple shots fired in rapid succession. The keeper should address them in the order they were shot.
* **Ball Deflection:** Upon saving, the ball should be deflected by the keeper.
* The deflection should appear physically plausible (e.g., bouncing off in a direction opposite to the keeper's saving motion).
* The deflected ball should travel with apparent force, eventually moving "out of the page" (i.e., off the main interactive area of the canvas). Precise collision physics for the save itself are not strictly necessary if a convincing animation can be achieved.

**3.4. Problem & Solution Display:**
* **Data Structure:** Maintain a list/array of Webflow problems, where each problem has an associated solution string.
* **Speech Bubble:**
* When a goal is saved, a speech bubble appears near the goalkeeper's head.
* The bubble displays the solution corresponding to the problem on the saved ball.
* The speech bubble should remain fixed relative to a point near the keeper's mouth (it should not rotate or be affected by physics).
* It should fade in when a solution is displayed and fade out after a short duration (e.g., 3-5 seconds).
* **Rapid Saves:** If two shots are saved in such quick succession that the first solution wouldn't be readable, the speech bubble for the second (or subsequent) save should display: "Ahhh, give me time to answer the problem!" until the queue is clear enough to display the actual solution.

**3.5. Visuals & Styling:**
* **Overall Aesthetic:** Clean, modern, and slightly playful to match a tech agency's vibe.
* **Perspective:** Ball shrinking as it approaches the goal.
* **Goalkeeper:** Customizable with overlaid images.
* **Speech Bubble:** Clear, legible font. Simple, non-intrusive design.

**4. Technical Considerations:**

- **Physics Engine:** **Matter.js** is recommended for 2D physics, ragdoll effects, and force application.
- **Rendering:** HTML5 Canvas API.
- **Animation:** Combination of physics-driven animation (for ragdoll and ball movement) and programmatic animation (e.g., speech bubble fades, perspective scaling).
- **Event Handling:** Mouse clicks for "Shoot" buttons.
- **Responsiveness:** The canvas and its internal elements must adapt to different screen sizes, with a specific layout change for mobile.
- **Modularity:** Code should be well-organized, allowing for easy updates to the problem/solution list or visual assets.

**5. Deliverables:**

- A self-contained HTML, CSS (if any, for canvas styling/positioning), and JavaScript module implementing the interactive hero element.
- Well-commented code.
- Ability to easily customize:
    - The list of Webflow problems and their solutions.
    - Images for the goalkeeper's head and attire.

**6. Open Questions from Client (to be discussed with Developer):**
* Finalizing the exact responsive scaling behavior of the canvas vs. internal elements.
* Specifics of the "explosive force" visual effect if the keeper is in mid-air.
* Detailed styling of buttons, speech bubble, and other non-physics elements.
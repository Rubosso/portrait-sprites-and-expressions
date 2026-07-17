# No Expression

Portrait sprites can use `currentExpression: -1` to hide the expression/head layer while preserving the body sprite.

The HUD exposes this state as **No Expression** in the expression selector and includes it in previous/next cycling. Existing sprites with numeric expression indexes remain compatible.

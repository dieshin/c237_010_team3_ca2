const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();


// ==================================================
// DATABASE CONNECTION
// ==================================================

const db = mysql.createConnection({
    host: 'c237-meilan-mysql.mysql.database.azure.com',
    user: 'c237_010',
    password: 'YOUR_DATABASE_PASSWORD',
    database: 'c237_010_team3_ca2',

    ssl: {
        rejectUnauthorized: false
    }
});


// Connect to MySQL
db.connect((err) => {

    if (err) {

        console.error(
            'Database connection error:',
            err
        );

        return;
    }

    console.log(
        'Connected to database'
    );
});


// ==================================================
// MIDDLEWARE
// ==================================================

app.use(
    express.urlencoded({
        extended: false
    })
);

app.use(
    express.static('public')
);

app.use(
    session({
        secret: 'secret',
        resave: false,
        saveUninitialized: false,

        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

app.use(
    flash()
);

app.set(
    'view engine',
    'ejs'
);


// ==================================================
// AUTHENTICATION MIDDLEWARE
// ==================================================

const checkAuthenticated = (req, res, next) => {

    if (req.session.user) {

        return next();
    }

    req.flash(
        'error',
        'Please log in to view this resource.'
    );

    return res.redirect(
        '/login'
    );
};


const checkAdmin = (req, res, next) => {

    if (
        req.session.user &&
        req.session.user.role === 'admin'
    ) {

        return next();
    }

    req.flash(
        'error',
        'Access denied.'
    );

    return res.redirect(
        '/dashboard'
    );
};


// ==================================================
// REGISTRATION VALIDATION
// ==================================================

const validateRegistration = (req, res, next) => {

    const {
        username,
        email,
        password,
        address,
        contact
    } = req.body;


    if (
        !username ||
        !email ||
        !password ||
        !address ||
        !contact
    ) {

        req.flash(
            'error',
            'All fields are required.'
        );

        req.flash(
            'formData',
            req.body
        );

        return res.redirect(
            '/register'
        );
    }


    if (password.length < 6) {

        req.flash(
            'error',
            'Password should be at least 6 characters long.'
        );

        req.flash(
            'formData',
            req.body
        );

        return res.redirect(
            '/register'
        );
    }


    next();
};


// ==================================================
// HOME PAGE
// ==================================================

app.get(
    '/',
    (req, res) => {

        res.render(
            'index',
            {
                user: req.session.user,

                messages: req.flash(
                    'success'
                ),

                errors: req.flash(
                    'error'
                )
            }
        );
    }
);


// ==================================================
// REGISTER PAGE
// ==================================================

app.get(
    '/register',
    (req, res) => {

        res.render(
            'register',
            {
                messages: req.flash(
                    'error'
                ),

                formData: req.flash(
                    'formData'
                )[0]
            }
        );
    }
);


// ==================================================
// REGISTER USER
// ==================================================

app.post(
    '/register',
    validateRegistration,

    (req, res) => {

        const {
            username,
            email,
            password,
            address,
            contact
        } = req.body;


        const role = 'user';


        const sql = `
            INSERT INTO users
            (
                username,
                email,
                password,
                address,
                contact,
                role,
                login_attempts,
                status
            )

            VALUES
            (
                ?,
                ?,
                SHA1(?),
                ?,
                ?,
                ?,
                0,
                'active'
            )
        `;


        db.query(
            sql,

            [
                username,
                email,
                password,
                address,
                contact,
                role
            ],

            (err) => {

                if (err) {

                    console.error(
                        'Registration error:',
                        err
                    );


                    if (
                        err.code === 'ER_DUP_ENTRY'
                    ) {

                        req.flash(
                            'error',
                            'Email or username already exists.'
                        );

                        return res.redirect(
                            '/register'
                        );
                    }


                    return res.send(
                        'Error registering user.'
                    );
                }


                req.flash(
                    'success',
                    'Registration successful! Please log in.'
                );


                return res.redirect(
                    '/login'
                );
            }
        );
    }
);


// ==================================================
// LOGIN PAGE
// ==================================================

app.get(
    '/login',
    (req, res) => {

        res.render(
            'login',
            {
                messages: req.flash(
                    'success'
                ),

                errors: req.flash(
                    'error'
                )
            }
        );
    }
);


// ==================================================
// LOGIN
// ==================================================

app.post(
    '/login',
    (req, res) => {

        const {
            email,
            password
        } = req.body;


        if (
            !email ||
            !password
        ) {

            req.flash(
                'error',
                'All fields are required.'
            );

            return res.redirect(
                '/login'
            );
        }


        const sql = `
            SELECT *
            FROM users
            WHERE email = ?
        `;


        db.query(
            sql,
            [email],

            (err, results) => {

                if (err) {

                    console.error(
                        'Login database error:',
                        err
                    );

                    return res.send(
                        'Database error.'
                    );
                }


                if (
                    results.length === 0
                ) {

                    req.flash(
                        'error',
                        'Invalid email or password.'
                    );

                    return res.redirect(
                        '/login'
                    );
                }


                const user = results[0];


                // Prevent NULL values
                const loginAttempts =
                    user.login_attempts || 0;


                // Check whether account is locked
                if (
                    user.status === 'locked'
                ) {

                    req.flash(
                        'error',
                        'Your account is locked. Please contact an administrator.'
                    );

                    return res.redirect(
                        '/login'
                    );
                }


                const loginSql = `
                    SELECT *
                    FROM users
                    WHERE email = ?
                    AND password = SHA1(?)
                `;


                db.query(
                    loginSql,

                    [
                        email,
                        password
                    ],

                    (err, loginResults) => {

                        if (err) {

                            console.error(
                                'Password verification error:',
                                err
                            );

                            return res.send(
                                'Database error.'
                            );
                        }


                        // ==========================================
                        // CORRECT PASSWORD
                        // ==========================================

                        if (
                            loginResults.length > 0
                        ) {

                            const loggedInUser =
                                loginResults[0];


                            const resetAttemptsSql = `
                                UPDATE users

                                SET login_attempts = 0,
                                status = 'active'

                                WHERE email = ?
                            `;


                            db.query(
                                resetAttemptsSql,
                                [email]
                            );


                            req.session.user =
                                loggedInUser;


                            req.flash(
                                'success',
                                'Login successful!'
                            );


                            if (
                                loggedInUser.role === 'admin'
                            ) {

                                return res.redirect(
                                    '/admin'
                                );
                            }


                            return res.redirect(
                                '/dashboard'
                            );
                        }


                        // ==========================================
                        // WRONG PASSWORD
                        // ==========================================

                        const newAttempts =
                            loginAttempts + 1;


                        if (
                            newAttempts >= 3
                        ) {

                            const lockSql = `
                                UPDATE users

                                SET login_attempts = ?,
                                status = 'locked'

                                WHERE email = ?
                            `;


                            db.query(
                                lockSql,

                                [
                                    newAttempts,
                                    email
                                ]
                            );


                            req.flash(
                                'error',
                                'Account locked after 3 failed login attempts.'
                            );
                        }


                        else {

                            const attemptsSql = `
                                UPDATE users

                                SET login_attempts = ?

                                WHERE email = ?
                            `;


                            db.query(
                                attemptsSql,

                                [
                                    newAttempts,
                                    email
                                ]
                            );


                            req.flash(
                                'error',
                                'Invalid email or password.'
                            );
                        }


                        return res.redirect(
                            '/login'
                        );
                    }
                );
            }
        );
    }
);


// ==================================================
// USER DASHBOARD
// ==================================================

app.get(
    '/dashboard',

    checkAuthenticated,

    (req, res) => {

        res.render(
            'dashboard',
            {
                user: req.session.user
            }
        );
    }
);


// ==================================================
// ADMIN DASHBOARD
// ==================================================

app.get(
    '/admin',

    checkAuthenticated,
    checkAdmin,

    (req, res) => {

        const sql = `
            SELECT *

            FROM users

            WHERE status = 'locked'

            ORDER BY id DESC
        `;


        db.query(
            sql,

            (err, results) => {

                if (err) {

                    console.error(
                        'Admin dashboard error:',
                        err
                    );

                    return res.send(
                        'Database error.'
                    );
                }


                res.render(
                    'admin',
                    {
                        user: req.session.user,

                        lockedUsers: results,

                        messages: req.flash(
                            'success'
                        ),

                        errors: req.flash(
                            'error'
                        )
                    }
                );
            }
        );
    }
);


// ==================================================
// UNLOCK USER
// ==================================================

app.post(
    '/admin/unlock/:id',

    checkAuthenticated,
    checkAdmin,

    (req, res) => {

        const userId =
            req.params.id;


        const sql = `
            UPDATE users

            SET login_attempts = 0,
            status = 'active'

            WHERE id = ?
        `;


        db.query(
            sql,

            [userId],

            (err) => {

                if (err) {

                    console.error(
                        'Unlock user error:',
                        err
                    );

                    req.flash(
                        'error',
                        'Database error unlocking account.'
                    );

                    return res.redirect(
                        '/admin'
                    );
                }


                req.flash(
                    'success',
                    'Account unlocked successfully.'
                );


                return res.redirect(
                    '/admin'
                );
            }
        );
    }
);


// ==================================================
// WORKOUT PAGE
// SEARCHING, FILTERING, SORTING AND STATISTICS
// ==================================================

app.get(
    '/workout',

    checkAuthenticated,

    (req, res) => {

        const userId =
            req.session.user.id;


        const search =
            req.query.search || '';


        const muscleGroup =
            req.query.muscleGroup || '';


        const sort =
            req.query.sort || 'newest';


        let sql = `
            SELECT *

            FROM workouts

            WHERE userId = ?
        `;


        const values = [
            userId
        ];


        // SEARCH
        if (
            search
        ) {

            sql += `
                AND
                (
                    exerciseName LIKE ?
                    OR title LIKE ?
                )
            `;


            values.push(
                `%${search}%`,
                `%${search}%`
            );
        }


        // FILTER
        if (
            muscleGroup
        ) {

            sql += `
                AND muscleGroup = ?
            `;


            values.push(
                muscleGroup
            );
        }


        // SORT
        if (
            sort === 'oldest'
        ) {

            sql += `
                ORDER BY workoutDate ASC
            `;
        }


        else if (
            sort === 'heaviest'
        ) {

            sql += `
                ORDER BY weight DESC
            `;
        }


        else if (
            sort === 'lightest'
        ) {

            sql += `
                ORDER BY weight ASC
            `;
        }


        else {

            sql += `
                ORDER BY workoutDate DESC
            `;
        }


        // GET WORKOUTS
        db.query(
            sql,

            values,

            (err, workouts) => {

                if (err) {

                    console.error(
                        'Error retrieving workouts:',
                        err
                    );

                    return res.send(
                        'Error retrieving workouts.'
                    );
                }


                // ==========================================
                // WORKOUT STREAK
                // ==========================================

                const streakSql = `
                    SELECT DISTINCT

                    DATE(workoutDate)
                    AS workoutDay

                    FROM workouts

                    WHERE userId = ?

                    ORDER BY workoutDay DESC
                `;


                db.query(
                    streakSql,

                    [userId],

                    (err, streakResults) => {

                        if (err) {

                            console.error(
                                'Streak error:',
                                err
                            );

                            return res.send(
                                'Error calculating workout streak.'
                            );
                        }


                        let streak = 0;


                        if (
                            streakResults.length > 0
                        ) {

                            const today =
                                new Date();


                            today.setHours(
                                0,
                                0,
                                0,
                                0
                            );


                            const latestWorkout =
                                new Date(
                                    streakResults[0].workoutDay
                                );


                            latestWorkout.setHours(
                                0,
                                0,
                                0,
                                0
                            );


                            const daysSinceWorkout =
                                Math.floor(
                                    (
                                        today -
                                        latestWorkout
                                    ) /

                                    (
                                        1000 *
                                        60 *
                                        60 *
                                        24
                                    )
                                );


                            if (
                                daysSinceWorkout <= 1
                            ) {

                                streak = 1;


                                for (
                                    let i = 1;

                                    i < streakResults.length;

                                    i++
                                ) {

                                    const previousDate =
                                        new Date(
                                            streakResults[i - 1]
                                                .workoutDay
                                        );


                                    const currentDate =
                                        new Date(
                                            streakResults[i]
                                                .workoutDay
                                        );


                                    previousDate.setHours(
                                        0,
                                        0,
                                        0,
                                        0
                                    );


                                    currentDate.setHours(
                                        0,
                                        0,
                                        0,
                                        0
                                    );


                                    const difference =
                                        Math.floor(
                                            (
                                                previousDate -
                                                currentDate
                                            ) /

                                            (
                                                1000 *
                                                60 *
                                                60 *
                                                24
                                            )
                                        );


                                    if (
                                        difference === 1
                                    ) {

                                        streak++;
                                    }


                                    else {

                                        break;
                                    }
                                }
                            }
                        }


                        // ==========================================
                        // WEEKLY PROGRESS
                        // ==========================================

                        const weeklySql = `
                            SELECT

                            DATE(workoutDate)
                            AS workoutDay,

                            COUNT(*)
                            AS workoutCount

                            FROM workouts

                            WHERE userId = ?

                            AND workoutDate >=
                            DATE_SUB(
                                CURDATE(),
                                INTERVAL 6 DAY
                            )

                            GROUP BY
                            DATE(workoutDate)

                            ORDER BY workoutDay ASC
                        `;


                        db.query(
                            weeklySql,

                            [userId],

                            (err, weeklyProgress) => {

                                if (err) {

                                    console.error(
                                        'Weekly progress error:',
                                        err
                                    );

                                    return res.send(
                                        'Error retrieving weekly progress.'
                                    );
                                }


                                // ==========================================
                                // PERSONAL BESTS
                                // ==========================================

                                const personalBestSql = `
                                    SELECT

                                    exerciseName,

                                    MAX(weight)
                                    AS personalBest

                                    FROM workouts

                                    WHERE userId = ?

                                    GROUP BY
                                    exerciseName

                                    ORDER BY
                                    personalBest DESC
                                `;


                                db.query(
                                    personalBestSql,

                                    [userId],

                                    (err, personalBests) => {

                                        if (err) {

                                            console.error(
                                                'Personal best error:',
                                                err
                                            );

                                            return res.send(
                                                'Error retrieving personal bests.'
                                            );
                                        }


                                        res.render(
                                            'workout',

                                            {
                                                workouts:
                                                    workouts,

                                                user:
                                                    req.session.user,

                                                search:
                                                    search,

                                                muscleGroup:
                                                    muscleGroup,

                                                sort:
                                                    sort,

                                                streak:
                                                    streak,

                                                weeklyProgress:
                                                    weeklyProgress,

                                                personalBests:
                                                    personalBests,

                                                messages:
                                                    req.flash(
                                                        'success'
                                                    ),

                                                errors:
                                                    req.flash(
                                                        'error'
                                                    )
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    }
);


// ==================================================
// ADD WORKOUT PAGE
// ==================================================

app.get(
    '/workout/add',

    checkAuthenticated,

    (req, res) => {

        res.render(
            'addWorkout',

            {
                user:
                    req.session.user,

                errors:
                    req.flash(
                        'error'
                    ),

                success:
                    req.flash(
                        'success'
                    )
            }
        );
    }
);


// ==================================================
// ADD WORKOUT
// ==================================================

app.post(
    '/workout/add',

    checkAuthenticated,

    (req, res) => {

        const {
            title,
            muscleGroup,
            exerciseName,
            sets,
            reps,
            weight,
            restTime,
            notes
        } = req.body;


        const userId =
            req.session.user.id;


        // Required fields
        if (
            !title ||
            !muscleGroup ||
            !exerciseName ||
            !sets ||
            !reps ||
            !weight ||
            !restTime
        ) {

            req.flash(
                'error',
                'All fields are required.'
            );

            return res.redirect(
                '/workout/add'
            );
        }


        // Validate numbers
        if (
            isNaN(sets) ||
            isNaN(reps) ||
            isNaN(weight) ||
            isNaN(restTime)
        ) {

            req.flash(
                'error',
                'Sets, reps, weight and rest time must be numbers.'
            );

            return res.redirect(
                '/workout/add'
            );
        }


        const sql = `
            INSERT INTO workouts

            (
                userId,
                title,
                muscleGroup,
                exerciseName,
                sets,
                reps,
                weight,
                restTime,
                workoutDate,
                notes
            )

            VALUES

            (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NOW(),
                ?
            )
        `;


        db.query(
            sql,

            [
                userId,
                title,
                muscleGroup,
                exerciseName,
                sets,
                reps,
                weight,
                restTime,
                notes || null
            ],

            (err) => {

                if (err) {

                    console.error(
                        'Error saving workout:',
                        err
                    );

                    req.flash(
                        'error',
                        'Database error saving workout.'
                    );

                    return res.redirect(
                        '/workout/add'
                    );
                }


                req.flash(
                    'success',
                    'Workout successfully tracked!'
                );


                return res.redirect(
                    '/workout'
                );
            }
        );
    }
);


// ==================================================
// DELETE WORKOUT
// ==================================================

app.post(
    '/workout/delete/:id',

    checkAuthenticated,

    (req, res) => {

        const workoutId =
            req.params.id;


        const userId =
            req.session.user.id;


        const sql = `
            DELETE FROM workouts

            WHERE workoutId = ?

            AND userId = ?
        `;


        db.query(
            sql,

            [
                workoutId,
                userId
            ],

            (err) => {

                if (err) {

                    console.error(
                        'Delete workout error:',
                        err
                    );

                    req.flash(
                        'error',
                        'Database error deleting workout.'
                    );

                    return res.redirect(
                        '/workout'
                    );
                }


                req.flash(
                    'success',
                    'Workout deleted successfully.'
                );


                return res.redirect(
                    '/workout'
                );
            }
        );
    }
);


// ==================================================
// LOGOUT
// ==================================================

app.get(
    '/logout',

    (req, res) => {

        req.session.destroy(
            (err) => {

                if (err) {

                    console.error(
                        'Logout error:',
                        err
                    );

                    return res.send(
                        'Error logging out.'
                    );
                }


                return res.redirect(
                    '/login'
                );
            }
        );
    }
);


// ==================================================
// START SERVER
// ==================================================

app.listen(
    3000,

    () => {

        console.log(
            'Server started on http://localhost:3000'
        );
    }
);

-- Create the users table
CREATE TABLE `users` (
  `id` INT(11) NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `username` VARCHAR(20) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `address` VARCHAR(255) NOT NULL,
  `contact` VARCHAR(10) NOT NULL,
  `role` VARCHAR(10) NOT NULL DEFAULT 'user',
  `login_attempts` INT(11) NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;


-- Create the workouts table
CREATE TABLE `workouts` (
    `workoutId` INT AUTO_INCREMENT PRIMARY KEY,
    `userId` INT NOT NULL,
    `title` VARCHAR(100) NOT NULL,   
    `exerciseName` VARCHAR(100) NOT NULL,
    `muscleGroup` VARCHAR(50) NOT NULL,
    `sets` INT NOT NULL,
    `reps` INT NOT NULL,
    `weight` DECIMAL(6,2) NOT NULL,
    `restTime` INT NOT NULL DEFAULT 60,
    `workoutDate` DATE NOT NULL,
    `notes` TEXT,

    CONSTRAINT `fk_workout_user`
        FOREIGN KEY (`userId`)
        REFERENCES `users`(`id`)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


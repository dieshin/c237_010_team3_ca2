-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: c237-meilan-mysql.mysql.database.azure.com    Database: c237_010_team3_ca2
-- ------------------------------------------------------
-- Server version	8.0.44-azure

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(20) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `contact` varchar(10) NOT NULL,
  `role` varchar(10) NOT NULL,
  `login_attempts` int NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `last_login` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (3,'y','y@gmail.com','3421ecde2a5de6543b48460b867cf323b018bc22','yyy','yyy','user',0,'active',NULL),(4,'y','y@gmail.com','3421ecde2a5de6543b48460b867cf323b018bc22','y','12345678','user',0,'active',NULL),(5,'123','123@gmail.com','7c4a8d09ca3762af61e59520943dc26494f8941b','123','12345678','user',2,'banned',NULL),(6,'chud jieming','chudjieming@gmail.com','b9edd50a6b8331c68b667c9dd2f95c8d5e0472f4','chudville67','12345678','user',0,'active',NULL),(8,'user','user@email.com','e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446','user123isthepw','user','member',0,'active',NULL),(10,'admin','admin@email.com','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','admin123isthepw','admin','admin',0,'active',NULL),(11,'admin1d','admin1@email.com','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','admin123isthepw','admin','member',0,'active',NULL),(12,'admin1','admin1@email.com','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','admin123isthepw','admin','admin',0,'active',NULL),(13,'admin123','admin123@email.com','240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9','admin123isthepw','admin','admin',0,'active',NULL),(14,'134','421@g','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','1','1','member',0,'active',NULL),(15,'jieming','chudjieming@gmail.com','6a3a7328a3e89850179e6c644ae16f34d1347f3c6481e1e74f42c391c223eaab','chudville','999999999','user',0,'active',NULL),(16,'333','333@gmail.com','68487dc295052aa79c530e283ce698b8c6bb1b42ff0944252e1910dbecdc5425','12121212','34564321','user',0,'active',NULL),(17,'user','user@gmail.com','e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446','user123','12345678','user',0,'active',NULL),(18,'user123@email.com','user123@email.com','e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446','user123','user123','member',0,'active',NULL),(19,'chudjieming','chudjieming@gmail.com','6a3a7328a3e89850179e6c644ae16f34d1347f3c6481e1e74f42c391c223eaab','chhudville567','12345678','user',0,'active',NULL),(20,'testadmin','testadmin@email.com','ecd71870d1963316a97e3ac3408c9835ad8cf0f3c1bc703527c30265534f75ae','test','test','user',0,'active',NULL),(21,'member','member@email.com','5600376e863d2f57a053518f324ad3840b0bc2348b573af281a7b7cbe7a228c6','member','member','member',0,'active',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workouts`
--

DROP TABLE IF EXISTS `workouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workouts` (
  `workoutId` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `title` varchar(100) NOT NULL,
  `exerciseName` varchar(100) NOT NULL,
  `muscleGroup` varchar(50) NOT NULL,
  `sets` int NOT NULL,
  `reps` int NOT NULL,
  `weight` decimal(6,2) NOT NULL,
  `restTime` int NOT NULL DEFAULT '60',
  `workoutDate` date NOT NULL,
  `notes` text,
  PRIMARY KEY (`workoutId`),
  KEY `fk_workout_user` (`userId`),
  CONSTRAINT `fk_workout_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workouts`
--

LOCK TABLES `workouts` WRITE;
/*!40000 ALTER TABLE `workouts` DISABLE KEYS */;
INSERT INTO `workouts` VALUES (9,16,'right nipple','nipple pinches','Chest',15,50,100.00,3,'2026-07-23','pinches'),(10,8,'2','2','Back',2,2,2.00,2,'2026-07-24','2'),(11,15,'chest','lat','Back',1,2,2.00,2,'2026-07-24',''),(12,15,'chud jieming','lats','Back',3,3,3.00,3,'2026-07-24',''),(13,11,'w','w','Chest',2,2,2.00,2,'2026-07-24','');
/*!40000 ALTER TABLE `workouts` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-24 19:58:28


require('dotenv').config();
const bcrypt = require("bcrypt");

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  max: 20,
  idleTimeoutMillis: 30000,
});

async function queryWithPool(query, values) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return result;
  } finally {
    client.release();
  }
}





// Zeige alle bestehenden Tabellen die zugängig sind
async function getAllTables() {
  try {
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;

    const result = await queryWithPool(query);

    const tableNames = result.rows.map(row => row.table_name);

    console.log('Table names:', tableNames);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Greife auf bestimmte Tabelle zu
async function accessSpecificTable(tableName) {
  try {
    const query = `SELECT * FROM ${tableName};`;
    const result = await queryWithPool(query);
    return result.rows; // Return the fetched data
  } catch (error) {
    console.error('Error:', error.message);
    throw error; // Rethrow the error to be handled in the calling code
  }
}

// Greife auf alle Anzeigen eines bestimmten Benutzers zu
async function getUserOffers(userID) {
  try {
    //console.log('Fetching user offers for user ID:', userID);
    
    const query = `
      SELECT *
      FROM anzeige
      WHERE benutzer = $1;
    `;
    const result = await queryWithPool(query, [userID]);
    
    //console.log('Fetched user offers:', result.rows);
    return result.rows; // Return the fetched data
  } catch (error) {
    console.error('Error:', error.message);
    throw error; // Rethrow the error to be handled in the calling code
  }
}



/*alt
async function accessSpecificTable(tableName) {
  try {
    const query = `SELECT * FROM ${tableName};`;

    const result = await queryWithPool(query);

    console.log(`Data from table "${tableName}":`, result.rows);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
*/

//Benutzer anzeigen

async function getUserByID(userID) {
  try {
    const query = `
      SELECT *
      FROM benutzer
      WHERE benutzerid = $1;
    `;

    const values = [userID];
    const result = await queryWithPool(query, values);

    if (result.rows.length === 0) {
      throw new Error('User not found.');
    }

    const user = result.rows[0]; // Retrieve the first user record

    // Print the user data to the console
    //console.log('User found:', user);

    return user; // Return the user record
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    throw error;
  }
}

//Änderung Rating

async function updateUserRating(publicUserID, newRating) {
  try {
    // Rufe den Benutzer anhand der publicUserID ab
    const publicUser = await getUserByID(publicUserID);

    // Berechne die neue Bewertung basierend auf dem übergebenen Rating
    const newTotalRating = calculateNewRating(publicUser.zufriedenheit, publicUser.bewertungsanzahl, newRating);

    // Aktualisiere die Bewertung des Benutzers in der Datenbank
    await updateUserAttribute(publicUserID, "Zufriedenheit", newTotalRating);

    // Erhöhe die Bewertungszahl des Benutzers in der Datenbank
    const newNumRating = await updateUserAttribute(publicUserID, "Bewertungsanzahl", parseInt(publicUser.bewertungsanzahl) + 1);

    console.log('User rating updated successfully.');
  } catch (error) {
    console.error('Error updating user rating:', error);
    throw error;
  }
}

// Funktion zur Berechnung der neuen Bewertung
function calculateNewRating(currentRating, numRatings, newRating) {
  const totalRating = currentRating * numRatings;
  const newTotalRating = totalRating + newRating;
  return newTotalRating/( parseInt(numRatings)+1);
}









// Suche nach Anzeige mit bestimmten Details
async function searchInTable(table, searchCriteria) {
  try {
    const jsonbConditions = [];
    const nonJsonbConditions = [];

    // ... (deine Suchkriterien hier)

    const jsonbQuery = jsonbConditions.length > 0 ? `(${jsonbConditions.join(' AND ')})` : '';
    const nonJsonbQuery = nonJsonbConditions.length > 0 ? `(${nonJsonbConditions.join(' AND ')})` : '';

    let finalQuery = '';
    if (jsonbQuery && nonJsonbQuery) {
      finalQuery = `
        SELECT * FROM ${table}
        WHERE ${jsonbQuery} AND ${nonJsonbQuery};
      `;
    } else {
      finalQuery = `
        SELECT * FROM ${table}
        WHERE ${jsonbQuery}${nonJsonbQuery};
      `;
    }

    const result = await queryWithPool(finalQuery);

    console.log(`Results from table "${table}":`, result.rows);
  } catch (error) {
    console.error('Error:', error.message);
  }
}


// Hinzufügen einer Anzeige
async function insertAnzeige(anzeigeData) {
  try {
    const {
      Name,
      Ort,
      PLZ,
      Benutzer,
      Preis,
      Verhandlungsbasis,
      Strasse,
      Bilder,
      Beschreibung,
      Inserierungsdatum,
      Ansichtszahl,
      Suche,
      Details
      // ... Weitere benötigte Eigenschaften ...
    } = anzeigeData;

    const query = `
      INSERT INTO Anzeige (
        Name,
        Ort,
        PLZ,
        Benutzer,
        Preis,
        Verhandlungsbasis,
        Strasse,
        Bilder,
        Beschreibung,
        Inserierungsdatum,
        Ansichtszahl,
        Suche,
        Details
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
    `;

    // Array der Parameterwerte in der gleichen Reihenfolge wie in der Query
    const values = [
      Name,
      Ort,
      PLZ,
      Benutzer,
      Preis,
      Verhandlungsbasis,
      Strasse,
      Bilder,
      Beschreibung,
      Inserierungsdatum.toISOString(),
      Ansichtszahl,
      Suche,
      JSON.stringify(Details)
    ];

    await queryWithPool(query, values);

    console.log('Anzeige inserted successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}


// Löschen einer Anzeige
async function deleteAnzeige(anzeigeid) {
  try {
    const query = `
      DELETE FROM Anzeige
      WHERE AnzeigeID = ${anzeigeid};
    `;

    await queryWithPool(query);

    console.log('Anzeige deleted successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}
// Ändern einer Anzeige
async function updateOfferAttribute(anzeigeId, attribute, newValue) {
  try {
    const updateQuery = `
      UPDATE Anzeige
      SET ${attribute} = $1
      WHERE AnzeigeID = $2;
    `;

    const values = [newValue, anzeigeId];
    await queryWithPool(updateQuery, values);

    console.log(`Offer with ID ${anzeigeId}: "${attribute}" updated to "${newValue}" successfully!`);
  } catch (error) {
    console.error('Error updating offer attribute:', error.message);
    throw error;
  }
}


async function getAnzeigeDetails(anzeigeID) {
  try {
    const query = `
      SELECT *
      FROM Anzeige
      WHERE AnzeigeID = $1;
    `;

    const values = [anzeigeID];
    const result = await queryWithPool(query, values);

    if (result.rows.length === 0) {
      throw new Error('Anzeige not found.');
    }

    const anzeigeDetails = result.rows[0];
    //console.log('Anzeige details:', anzeigeDetails);
    return anzeigeDetails;
  } catch (error) {
    console.error('Error fetching Anzeige details:', error.message);
    throw error;
  }
}


// Abfragen einer sortierten Chat-Historie
async function getSortedChatHistory(user1ID, user2ID) {
  try {
    const query = `
      SELECT *
      FROM Chat
      WHERE (Sender = $1 AND Empfaenger = $2) OR (Sender = $2 AND Empfaenger = $1)
      ORDER BY Datum, Uhrzeit;
    `;

    const values = [user1ID, user2ID];
    const result = await queryWithPool(query, values);

    return result.rows;
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw error;
  }
}

//Letze Chat-Nachricht + Sender für Chat-Vorschau

async function lastChatMessage(user1ID, user2ID) {
  try {
    const chatHistory = await getSortedChatHistory(user1ID, user2ID);

    if (chatHistory.length > 0) {
      const lastMessage = chatHistory[chatHistory.length - 1];
      return {
        sender: lastMessage.sender,
        message: lastMessage.nachricht
      };
    } else {
      return null; // No chat history available
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

//Hinzufügen einer Nachricht zu einem Chat
async function addMessageToChat(senderID, receiverID, messageText) {
  try {
    const query = `
      INSERT INTO Chat (Sender, Empfaenger, Nachricht, Datum, Uhrzeit)
      VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_TIME);
    `;

    const values = [senderID, receiverID, messageText];
    await queryWithPool(query, values);

    console.log('Message added to chat successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

//Abfrage aller Chat-Partner
async function getChatParticipants(userID) {
  try {
    const query = `
      SELECT DISTINCT CASE
        WHEN Sender = $1 THEN Empfaenger
        ELSE Sender
      END AS participant_id
      FROM Chat
      WHERE Sender = $1 OR Empfaenger = $1;
    `;

    const values = [userID];
    const result = await queryWithPool(query, values);

    const participantIDs = result.rows.map(row => row.participant_id);

    console.log('Chat participants for user', userID, ':', participantIDs);

    return participantIDs; // Stelle sicher, dass das Array zurückgegeben wird
  } catch (error) {
    console.error('Error fetching chat participants:', error);
    throw error;
  }
}

//Abfragen Letze Nachricht im Chat mit bestimmten User

async function getLastMessagesForUser(user) {
  try {
    const participantIDs = await getChatParticipants(user.benutzerid);

    const lastMessages = [];

    for (const participantID of participantIDs) {
      const chatPartner = await getUserByID(participantID); // Funktion, um Benutzerdetails zu erhalten
      const lastMessage = await lastChatMessage(user.benutzerid, participantID);
      const senderName = lastMessage ? (lastMessage.sender === user.benutzerid ? "Du" : chatPartner.vorname) : "Keine Nachrichten";
      const messageText = lastMessage ? lastMessage.message : "";
      lastMessages.push({
        chatPartner: chatPartner,
        sender: senderName,
        message: messageText
      });
    }

    return lastMessages;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}




//Followerverhältnis abrufen
async function getUserFollowInfo(userId) {
  try {
    const followingQuery = 'SELECT GefolgterAccount FROM Followerverhealtnis WHERE Originalaccount = $1';
    const followersQuery = 'SELECT Originalaccount FROM Followerverhealtnis WHERE GefolgterAccount = $1';

    const followingResult = await queryWithPool(followingQuery, [userId]);
    const followersResult = await queryWithPool(followersQuery, [userId]);

    const following = followingResult.rows.map(row => row.gefolgteraccount);
    const followers = followersResult.rows.map(row => row.originalaccount);

    console.log('Following:', following);
    console.log('Followers:', followers);

    return { following, followers };
  } catch (error) {
    console.error('Error getting user follow info:', error);
    throw error;
  }
}

//überprüfen ob Benutzer1 schon benutzer2 folgt
async function checkFollowerRelationship(user1Id, user2Id) {
  try {
    const checkQuery = `
      SELECT FollowerverhealtnisID
      FROM Followerverhealtnis
      WHERE Originalaccount = $1 AND GefolgterAccount = $2;`;

    const values = [user1Id, user2Id];
    
    const checkResult = await queryWithPool(checkQuery, values);

    if (checkResult.rows.length > 0) {
      console.log(`Followerverhältnis zwischen Account ${user1Id} und Account ${user2Id} besteht bereits.`);
      return true; // Verhältnis besteht bereits
    } else {
      console.log(`Followerverhältnis zwischen Account ${user1Id} und Account ${user2Id} besteht nicht.`);
      return false; // Verhältnis besteht nicht
    }
  } catch (error) {
    console.error('Fehler beim Überprüfen des Followerverhealtnisses:', error);
    throw error;
  }
}


// Hinzufügen von Followerverhältnis, falls es noch nicht besteht
async function addFollower(originalAccountID, followedAccountID) {
  const checkQuery = `
    SELECT FollowerverhealtnisID
    FROM Followerverhealtnis
    WHERE Originalaccount = $1 AND GefolgterAccount = $2;`;

  const insertQuery = `
    INSERT INTO Followerverhealtnis (Originalaccount, GefolgterAccount)
    VALUES ($1, $2)
    RETURNING FollowerverhealtnisID;`;

  const values = [originalAccountID, followedAccountID];

  try {
    const client = await pool.connect();

    // Überprüfen, ob das Verhältnis bereits existiert
    const checkResult = await client.query(checkQuery, values);

    if (checkResult.rows.length > 0) {
      client.release();
      console.log(`Es wird bereits ${followedAccountID} gefolgt.`);
      return null; // Verhältnis besteht bereits
    }

    // Followerverhältnis hinzufügen
    const insertResult = await client.query(insertQuery, values);
    const followerVerhealtnisID = insertResult.rows[0].FollowerverhealtnisID;

    client.release();

    console.log(`Followerverhealtnis mit ID ${followerVerhealtnisID} wurde hinzugefügt.`);
    return followerVerhealtnisID;
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Followerverhealtnisses:', error);
    throw error;
  }
}

async function deleteFollower(originalAccountID, unfollowedAccountID) {
  const checkQuery = `
    SELECT FollowerverhealtnisID
    FROM Followerverhealtnis
    WHERE Originalaccount = $1 AND GefolgterAccount = $2;`;

  const deleteQuery = `
    DELETE FROM Followerverhealtnis
    WHERE Originalaccount = $1 AND GefolgterAccount = $2
    RETURNING FollowerverhealtnisID;`;

  const values = [originalAccountID, unfollowedAccountID];

  try {
    const client = await pool.connect();

    // Überprüfen, ob das Verhältnis existiert
    const checkResult = await client.query(checkQuery, values);

    if (checkResult.rows.length > 0) {
      // Verhältnis existiert, daher löschen
      const deleteResult = await client.query(deleteQuery, values);
      const followerVerhealtnisID = deleteResult.rows[0]?.FollowerverhealtnisID;
      client.release();

      console.log(`Followerverhealtnis mit ID ${followerVerhealtnisID} wurde gelöscht.`);
      return followerVerhealtnisID; // Verhältnis wurde gelöscht
    } else {
      console.log(`Kein Followerverhältnis gefunden.`);
      return null; // Kein Verhältnis gefunden
    }
  } catch (error) {
    console.error('Fehler beim Löschen des Followerverhealtnisses:', error);
    throw error;
  }
}



// Funktion zum Überprüfen, ob die E-Mail bereits existiert
async function isEmailExists(email) {
  try {
    const query = `
      SELECT COUNT(*) AS count
      FROM Benutzer
      WHERE Email = $1;
    `;
    const result = await queryWithPool(query, [email]);
    const count = parseInt(result.rows[0].count);

    return count > 0;
  } catch (error) {
    console.error('Error checking email existence:', error.message);
    throw error;
  }
}

// Funktion zum Erstellen eines neuen Benutzers
async function createUser(newUser) {
  try {
    const {
      Vorname,
      Nachname,
      Email,
      Passworthash,
      PLZ,
      Ort,
      Telefon,
      Strasse,
      Hausnummer,
      Beitrittsdatum,
      Antwortrate,
      Antwortzeit,
      Zufriedenheit,
    } = newUser;

    // Überprüfen, ob die E-Mail bereits existiert
    const emailExists = await isEmailExists(Email);
    if (emailExists) {
      console.log('User with this email already exists.');
      return null;
    }

    const query = `
      INSERT INTO Benutzer (
        Vorname,
        Nachname,
        Email,
        Passworthash,
        PLZ,
        Ort,
        Telefon,
        Strasse,
        Hausnummer,
        Beitrittsdatum,
        Antwortrate,
        Antwortzeit,
        Zufriedenheit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,$13)
      RETURNING BenutzerID;
    `;

    const values = [
      Vorname,
      Nachname,
      Email,
      Passworthash,
      PLZ,
      Ort,
      Telefon,
      Strasse,
      Hausnummer,
      Beitrittsdatum,
      Antwortrate,
      Antwortzeit,
      Zufriedenheit,
    ];
    const result = await queryWithPool(query, values);

    const fullName = `${Vorname} ${Nachname}`;
    console.log(`User "${fullName}" created successfully!`);

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}


// Funktion zum Löschen eines Benutzers anhand der E-Mail
async function deleteUserByEmail(email) {
  try {
    const query = `
      DELETE FROM Benutzer
      WHERE Email = $1
      RETURNING BenutzerID;
    `;

    const values = [email];

    const result = await queryWithPool(query, values);

    if (result.rows.length > 0) {
      const deletedUserID = result.rows[0].benutzerid;
      console.log(`User with ID ${deletedUserID} deleted successfully!`);
      return deletedUserID;
    } else {
      console.log('No user found with this email.');
      return null;
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}


async function addGewerbe(userid, name, oeffnungszeiten, website, rechtlicheAngaben, unternehmensbeschreibung) {
  try {
    // Überprüfen, ob bereits ein Eintrag mit der angegebenen UserID existiert
    const checkExistingQuery = 'SELECT GewerblichID, Name FROM Gewerblich WHERE BenutzerID = $1';
    const checkExistingResult = await queryWithPool(checkExistingQuery, [userid]);

    if (checkExistingResult.rows.length > 0) {
      const existingGewerbeID = checkExistingResult.rows[0].GewerblichID;
      const existingName = checkExistingResult.rows[0].Name;

      // Prüfen, ob der neue Name bereits vergeben ist
      const checkNewNameQuery = 'SELECT GewerblichID FROM Gewerblich WHERE Name = $1';
      const checkNewNameResult = await queryWithPool(checkNewNameQuery, [name]);

      if (checkNewNameResult.rows.length > 0 && existingName !== name) {
        console.log(`A Gewerbe with the name "${name}" already exists.`);
        return;
      }

      // Update durchführen
      const updateQuery = `
        UPDATE Gewerblich
        SET Name = $1, Oeffnungszeiten = $2, Website = $3, RechtlicheAngaben = $4, Unternehmensbeschreibung = $5
        WHERE BenutzerID = $6;
      `;

      const updateValues = [name, oeffnungszeiten, website, rechtlicheAngaben, unternehmensbeschreibung, userid];
      await queryWithPool(updateQuery, updateValues);

      console.log(`Gewerbe ${name} updated successfully!`);
    } else {
      // Überprüfen, ob der Name bereits vergeben ist
      const checkNameQuery = 'SELECT GewerblichID FROM Gewerblich WHERE Name = $1';
      const checkNameResult = await queryWithPool(checkNameQuery, [name]);

      if (checkNameResult.rows.length > 0) {
        console.log(`A Gewerbe with the name "${name}" already exists.`);
        return;
      }

      // Eintrag hinzufügen
      const insertQuery = `
        INSERT INTO Gewerblich (BenutzerID, Name, Oeffnungszeiten, Website, RechtlicheAngaben, Unternehmensbeschreibung)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING GewerblichID;
      `;

      const insertValues = [userid, name, oeffnungszeiten, website, rechtlicheAngaben, unternehmensbeschreibung];
      const result = await queryWithPool(insertQuery, insertValues);

      const newGewerbeID = result.rows[0].gewerblichid;

      console.log(`Gewerbe ${name} added successfully with GewerblichID: ${newGewerbeID}`);

      // GewerbeID in der Tabelle Benutzer aktualisieren
      const updateUserQuery = 'UPDATE Benutzer SET GewerblichID = $1 WHERE BenutzerID = $2';
      const updateUserValues = [newGewerbeID, userid];
      await queryWithPool(updateUserQuery, updateUserValues);
      console.log(`GewerblichID in Benutzer table updated for UserID: ${userid}`);
    }
  } catch (error) {
    console.error('Error adding/updating Gewerbe:', error.message);
    throw error;
  }
}

addGewerbe(10,"test");






//Funktion zum Löschen eines Gewerbes

async function deleteGewerbeByName(name) {
  try {
    // Überprüfen, ob ein Gewerbe mit dem gegebenen Namen existiert
    const checkQuery = 'SELECT GewerblichID FROM Gewerblich WHERE Name = $1';
    const checkResult = await queryWithPool(checkQuery, [name]);

    if (checkResult.rows.length === 0) {
      console.log(`No Gewerbe found with the name "${name}".`);
      return null;
    }

    const deleteQuery = 'DELETE FROM Gewerblich WHERE Name = $1 RETURNING GewerblichID;';
    const result = await queryWithPool(deleteQuery, [name]);


    console.log(`Gewerbe with "${name}" has been deleted.`);


  } catch (error) {
    console.error('Error deleting Gewerbe:', error.message);
    throw error;
  }
}

//Abfrage eines Gwerbes anhand gewerbeID

async function getGewerbeByID(gewerbeID) {
  try {
      const query = 'SELECT * FROM Gewerblich WHERE GewerblichID = $1';
      const result = await queryWithPool(query, [gewerbeID]);

      if (result.rows.length === 0) {
          console.log(`No Gewerbe found with ID ${gewerbeID}.`);
          return null;
      }

      const gewerbe = result.rows[0];
      return gewerbe;

  } catch (error) {
      console.error('Error getting Gewerbe by ID:', error.message);
      throw error;
  }
}
  





// Funktion zum Ändern von Benutzerinformationen
async function updateUserAttribute(userId, attribute, newValue) {
  try {
    const updateQuery = `
      UPDATE Benutzer
      SET ${attribute} = $1
      WHERE BenutzerID = $2;
    `;

    const values = [newValue, userId];
    await queryWithPool(updateQuery, values);

    console.log(`User with ID ${userId}: "${attribute}" updated to "${newValue}" successfully!`);
  } catch (error) {
    console.error('Error updating user attribute:', error.message);
    throw error;
  }
}



async function comparePasswords(inputPassword, savedHashedPassword) {


console.log("inputpassw:" + inputPassword);
console.log("savedhash:" +savedHashedPassword);

  try {
    const match = await bcrypt.compare(inputPassword, savedHashedPassword);
    console.log(match);
    return match;
  } catch (error) {
    console.error('Error comparing passwords:', error);
    return false;
  }
}




function formatTime(time) {
  const options = { hour: '2-digit', minute: '2-digit' };
  return new Date(`1970-01-01T${time}`).toLocaleTimeString(undefined, options) + ' Uhr';
}

function formatDate(date) {
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  return new Date(date).toLocaleDateString(undefined, options);
}




module.exports = {
  createUser,
  updateUserAttribute,
  comparePasswords,
  getChatParticipants,
  getSortedChatHistory,
  getLastMessagesForUser,
  getUserByID,
  formatTime,
  formatDate,
  addMessageToChat,
  accessSpecificTable,
  searchInTable,
  getUserOffers,
  insertAnzeige,
  deleteAnzeige,
  getAnzeigeDetails,
  updateOfferAttribute,
  getGewerbeByID,
  addGewerbe,
  addFollower,
  deleteFollower,
  checkFollowerRelationship,
  getUserFollowInfo,
  updateUserRating

  
};

// Schließe den Pool, wenn die Anwendung beendet wird
process.on('exit', () => {
  pool.end();
});






//==================================================TESTEN================================================

//Gesamte Tabelle ausgeben lassen
//accessSpecificTable('anzeige');

//--------------------------------------------Anzeige hinzufügen------------------------------------------
/*Beispielwerte für neue Anzeige
const newAnzeige = {
    'Name': 'Gebrauchtes Auto zu verkaufen',
    'Ort': 'Stadtville',
    'PLZ': '12345',
    'Benutzer': 1,
    'Preis': 15000,
    'Verhandlungsbasis': true,
    'Strasse': 'Entwicklungsweg 5',
    'Bilder': 'Bild1.jpg,Bild2.jpg',
    'Beschreibung': 'Ein zuverlässiges Auto in gutem Zustand.',
    'Inserierungsdatum': new Date(),
    'Ansichtszahl': 0,
    'Details': {
      'Marke': 'Toyota',
      'Modell': 'Corolla',
      'Baujahr': 2015,
      // Weitere Details hier
    },
    'Suche': false
};

insertAnzeige(newAnzeige);

*/

//--------------------------------------------Suchen von Anzeige------------------------------------------

/*Suchkriterien für Anzeigesuche
const searchCriteriaForAnzeige = {
  'Marke': 'Toyota',
  'Baujahr': '2015',
  'Preis': '15000',
};

searchInTable('Anzeige', searchCriteriaForAnzeige);

*/

//--------------------------------------------Chat abrufen------------------------------------------
/*
const user1ID = 2; // ID of the first user
const user2ID = 1;// ID of the second user



(async () => {
  try {
    const chatHistory = await getSortedChatHistory(user1ID, user2ID);
    console.log("Chat History:", chatHistory);
  } catch (error) {
    console.error("Error:", error);
  }
})();
*/

//--------------------------------------------Letzten Chats abrufen------------------------------------------

/*
const user = {
  benutzerid: 2, // Setze die Benutzer-ID entsprechend
  // ... weitere Benutzerdaten ...
};

async function test() {
  try {
    const lastMessages = await getLastMessagesForUser(user);
    for (const message of lastMessages) {
      console.log(message);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();

*/


//--------------------------------------------Letzte Chat-Nachricht abrufen------------------------------------------

/*
const user1ID = 2; // ID of the first user
const user2ID = 1; // ID of the second user

(async () => {
  try {
    const lastMessage = await lastChatMessage(user1ID, user2ID);
    if (lastMessage) {
      console.log("Last Chat Message - Sender:", lastMessage.sender);
      console.log("Last Chat Message - Message:", lastMessage.message);
    } else {
      console.log("No chat history available.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
})();
*/







//------------------------------------------Chat hinzufügen-----------------------------------------

// Beispielaufruf der Funktion zum Hinzufügen einer Nachricht
//addMessageToChat(37, 20, 'Gut und dir?');


//------------------------------------Followerverhältnis abrufen-------------------------------------

// Beispielaufruf der Funktion für Benutzer mit der ID 2

/*
getUserFollowInfo(2)
*/

//------------------------------------Followerverhältnis ändern-------------------------------------

//addFollower(4, 6);
//addFollower(6, 4);
//deleteFollower(4,6);


//------------------------------------Hinzufügen eines Benutzers-------------------------------------

/*
// Beispielaufruf der Funktion zum Erstellen eines neuen Benutzers
const newUser = {
  Vorname: 'Max',
  Nachname: 'Mustermann',
  Email: 'max.musterman@example.com',
  Passwort: 'test',
  PLZ: '12345',
  Ort: 'Musterstadt',
  Telefon: '+123456789',
  Strasse: 'Musterstraße',
  Hausnummer: '42',
  Beitrittsdatum: new Date(),
  Antwortrate: 95.5,
  Antwortzeit: '2 hours',
  Zufriedenheit: 4,
};

createUser(newUser);
*/

//----------------------------------Löschen eines Benutzers by E-Mail-----------------------------------

/*
const userEmailToDelete = 'max.musterman@example.com';

deleteUserByEmail(userEmailToDelete)
*/

//--------------------------------------Hinzufügen und Löschen eines Gewerbes----------------------------------------

/*
addGewerbe(
  'Sample Business',
  'Montag-Freitag: 9:00-18:00, Samstag: 10:00-15:00',
  'https://www.samplebusiness.com',
  'Impressum und rechtliche Informationen...',
  'Beschreibung des Unternehmens...'
)

deleteGewerbeByName('Sample Business');
*/

/*
// Beispielaufruf der Funktion zum Ändern des Vornamens eines Benutzers
const userIdToUpdate = 1; // Benutzer-ID
const attributeName = 'Vorname'; // Zu änderndes Attribut
const newValue = 'NeuerVorname'; // Neuer Wert

updateUserAttribute(userIdToUpdate, attributeName, newValue);
*/


//--------------------------------------Testen von comparePasswords----------------------------------------

/*
const inputPassword =       'test'; // Das eingegebene Passwort, das überprüft werden soll
const savedHashedPassword = '$2b$10$tu14U4mz81fAS6vuzQGa2uSCatKRIpJzsFl1CNIGJOsmoLPNqo7ZG'; // Beispiel-gehashtes Passwort, das in der Datenbank gespeichert ist

comparePasswords(inputPassword, savedHashedPassword);

  //accessSpecificTable('benutzer');

*/





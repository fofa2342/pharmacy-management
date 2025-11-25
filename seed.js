// seed.js
import pool from './configs/db.js';
import bcrypt from 'bcrypt';

const seedAdminUser = async () => {
    const defaultPassword = 'adminpassword';
    const saltRounds = 10;

    try {
        const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

        const adminUser = {
            matricule: 'ADMIN001',
            nom: 'Admin',
            prenom: 'User',
            datenaissance: '1990-01-01',
            dateembauche: new Date().toISOString().split('T')[0],
            diplome: 'Master',
            poste: 'administrateur',
            contrat: 'CDI',
            mot_de_passe: hashedPassword, // Store the hashed password
            role: 'administrateur'
        };

        const connection = await pool.getConnection();

        // Check if user already exists to prevent duplicates
        const [existingUsers] = await connection.execute(
            'SELECT COUNT(*) AS count FROM personnel WHERE matricule = ?',
            [adminUser.matricule]
        );

        if (existingUsers[0].count === 0) {
            const query = `
                INSERT INTO personnel (matricule, nom, prenom, datenaissance, dateembauche, diplome, poste, contrat, mot_de_passe, role)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const values = [
                adminUser.matricule,
                adminUser.nom,
                adminUser.prenom,
                adminUser.datenaissance,
                adminUser.dateembauche,
                adminUser.diplome,
                adminUser.poste,
                adminUser.contrat,
                adminUser.mot_de_passe,
                adminUser.role
            ];

            await connection.execute(query, values);
            console.log(`Default admin user with matricule ${adminUser.matricule} created successfully! Password: ${defaultPassword}`);
        } else {
            console.log(`Admin user with matricule ${adminUser.matricule} already exists. Skipping insertion.`);
        }

        connection.release();
    } catch (error) {
        console.error('Error seeding admin user:', error);
    } finally {
        pool.end(); // Close the pool after seeding
    }
};

seedAdminUser();

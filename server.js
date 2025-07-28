const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser"); // Keep for other JSON/urlencoded routes if any
const path = require("path");
const multer = require("multer"); //

const app = express();
app.use(cors());

// You might still need body-parser for non-file-upload routes that send JSON or URL-encoded data.
// For routes handling file uploads with Multer, body-parser for JSON/URL-encoded data is not typically needed.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- Multer Setup (Add this block at the top) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/"); // Files will be stored in the 'uploads/' directory
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname); // Files will be named with a timestamp + original name
    }
});

const upload = multer({ storage: storage }); //
// --- End Multer Setup ---

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static('uploads')); //
app.use(express.static(path.join(__dirname, 'public')));


// Connect to MongoDB
mongoose.connect("mongodb://localhost:27017/proj", {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.once("open", () => console.log("MongoDB Connected"));
db.on("error", (err) => console.log("MongoDB connection error:", err));

// Schema for student
const studentSchema = new mongoose.Schema({
    regNo: { type: String, required: true, unique: true },
    dob: { type: String, required: true },
    department: { type: String, required: true },
    name: { type: String, required: true },
    photoUrl: { type: String, default: "please add your photo" }, // ✅ Add this
    marks: {
        sem1: { type: [Number], default: [] },
        sem2: { type: [Number], default: [] },
        sem3: { type: [Number], default: [] },
        sem4: { type: [Number], default: [] },
        sem5: { type: [Number], default: [] },
        sem6: { type: [Number], default: [] },
    }
}, { timestamps: true });

const Student = mongoose.model("Student", studentSchema);

// Schema for admin
const adminSchema = new mongoose.Schema({
    adminId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true }
}, { timestamps: true });

const Admin = mongoose.model("Admin", adminSchema);

// Serve static files from the client folder
app.use(express.static(path.join(__dirname, "client")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "client/index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "client/admin.html"));
});

app.get("/admin/add-student", (req, res) => {
    res.sendFile(path.join(__dirname, "client/admin-add-student.html"));
});

app.get("/admin/add-admin", (req, res) => {
    res.sendFile(path.join(__dirname, "client/admin-add-admin.html"));
});

app.get("/student-dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "client/student-dashboard.html"));
});

app.get("/admin-dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "client/admin-dashboard.html"));
});


// Student login route - CORRECTED
app.post("/login", async (req, res) => {
    try {
        const { regNo, dob, department } = req.body;

        // Validate required fields
        if (!regNo || !dob || !department) {
            return res.status(400).json({
                success: false,
                error: "All fields are required"
            });
        }

        // Format the date to match the database format
        const formattedDob = new Date(dob).toISOString().split('T')[0];

        const student = await Student.findOne({
            regNo: regNo.trim(),
            dob: formattedDob,
            department: department.trim()
        });

        if (student) {
            res.json({
                success: true,
                message: "Login successful",
                student: {
                    regNo: student.regNo,
                    name: student.name,
                    department: student.department,
                    marks: student.marks
                },
                redirect: "/student-dashboard"
            });
        } else {
            res.status(401).json({
                success: false,
                error: "Invalid login credentials. Please check your registration number, date of birth, and department."
            });
        }
    } catch (error) {
        console.error("Student login error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error. Please try again later."
        });
    }
});

// Admin login route - CORRECTED
app.post("/admin/login", async (req, res) => {
    try {
        const { adminId, password } = req.body;

        // Validate required fields
        if (!adminId || !password) {
            return res.status(400).json({
                success: false,
                error: "Admin ID and password are required"
            });
        }

        const admin = await Admin.findOne({
            adminId: adminId.trim(),
            password: password.trim()
        });

        if (admin) {
            res.json({
                success: true,
                message: "Admin login successful",
                admin: {
                    adminId: admin.adminId,
                    name: admin.name
                },
                redirect: "/admin-dashboard"
            });
        } else {
            res.status(401).json({
                success: false,
                error: "Invalid admin credentials. Please check your Admin ID and password."
            });
        }
    } catch (error) {
        console.error("Admin login error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error. Please try again later."
        });
    }
});

// Add new student route - ENHANCED with Multer
app.post("/admin/add-student", upload.single('photo'), async (req, res) => { //
    try {
        const { regNo, dob, department, name, sem1 } = req.body;
        const photoUrl = req.file ? `/uploads/${req.file.filename}` : ""; // Get the path to the uploaded file

        // Validate required fields
        if (!regNo || !dob || !department || !name || !req.file) { // Also check for req.file for photo
            return res.status(400).json({
                success: false,
                error: "All fields including photo are required"
            });
        }

        // Check if student already exists
        const existingStudent = await Student.findOne({ regNo: regNo.trim() });
        if (existingStudent) {
            return res.status(400).json({
                success: false,
                error: "Student with this registration number already exists"
            });
        }

        // Parse marks if provided
        let marks = { sem1: [] };
        if (sem1 && sem1.trim()) {
            try {
                marks.sem1 = sem1.split(",").map(mark => {
                    const parsedMark = parseInt(mark.trim());
                    if (isNaN(parsedMark) || parsedMark < 0 || parsedMark > 100) {
                        throw new Error("Invalid mark value");
                    }
                    return parsedMark;
                });
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid marks format. Please enter marks separated by commas (0-100)"
                });
            }
        }

        // Format the date
        const formattedDob = new Date(dob).toISOString().split('T')[0];

        const newStudent = new Student({
            regNo: regNo.trim(),
            dob: formattedDob,
            department: department.trim(),
            name: name.trim(),
            marks,
            photoUrl: photoUrl // Save the URL of the uploaded photo
        });

        await newStudent.save();
        res.json({
            success: true,
            message: "Student added successfully",
            student: {
                regNo: newStudent.regNo,
                name: newStudent.name,
                department: newStudent.department,
                photoUrl: newStudent.photoUrl // Include photoUrl in response
            }
        });
    } catch (error) {
        console.error("Add student error:", error);
        if (error.code === 11000) {
            res.status(400).json({
                success: false,
                error: "Student with this registration number already exists"
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to add student. Please try again."
            });
        }
    }
});

// Add new admin route - ENHANCED
app.post("/admin/add-admin", async (req, res) => {
    try {
        const { adminId, password, name } = req.body;

        // Validate required fields
        if (!adminId || !password || !name) {
            return res.status(400).json({
                success: false,
                error: "All fields are required"
            });
        }

        // Basic validation
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: "Password must be at least 6 characters long"
            });
        }

        // Check if admin already exists
        const existingAdmin = await Admin.findOne({ adminId: adminId.trim() });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                error: "Admin with this ID already exists"
            });
        }

        const newAdmin = new Admin({
            adminId: adminId.trim(),
            password: password.trim(),
            name: name.trim()
        });

        await newAdmin.save();
        res.json({
            success: true,
            message: "Admin added successfully",
            admin: {
                adminId: newAdmin.adminId,
                name: newAdmin.name
            }
        });
    } catch (error) {
        console.error("Add admin error:", error);
        if (error.code === 11000) {
            res.status(400).json({
                success: false,
                error: "Admin with this ID already exists"
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to add admin. Please try again."
            });
        }
    }
});

// Get student details route
app.get("/student/:regNo", async (req, res) => {
    try {
        const student = await Student.findOne({ regNo: req.params.regNo });
        if (student) {
            res.json({
                success: true,
                student: student
            });
        } else {
            res.status(404).json({
                success: false,
                error: "Student not found"
            });
        }
    } catch (error) {
        console.error("Get student error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

// Get all students route (for admin)
app.get("/admin/students", async (req, res) => {
    try {
        const students = await Student.find({}).sort({ regNo: 1 });
        res.json({
            success: true,
            students: students
        });
    } catch (error) {
        console.error("Get students error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

// Update student marks route - ENHANCED
app.post("/admin/update-marks", async (req, res) => {
    try {
        const { regNo, semester, marks } = req.body;

        if (!regNo || !semester || !marks) {
            return res.status(400).json({
                success: false,
                error: "All fields are required"
            });
        }

        // Validate semester
        const validSemesters = ['sem1', 'sem2', 'sem3', 'sem4', 'sem5', 'sem6'];
        if (!validSemesters.includes(semester)) {
            return res.status(400).json({
                success: false,
                error: "Invalid semester"
            });
        }

        // Parse and validate marks
        let marksArray;
        try {
            marksArray = marks.split(",").map(mark => {
                const parsedMark = parseInt(mark.trim());
                if (isNaN(parsedMark) || parsedMark < 0 || parsedMark > 100) {
                    throw new Error("Invalid mark value");
                }
                return parsedMark;
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: "Invalid marks format. Please enter marks separated by commas (0-100)"
            });
        }

        const updateObj = {};
        updateObj[`marks.${semester}`] = marksArray;

        const student = await Student.findOneAndUpdate(
            { regNo: regNo.trim() },
            updateObj,
            { new: true }
        );

        if (student) {
            res.json({
                success: true,
                message: "Marks updated successfully",
                student: {
                    regNo: student.regNo,
                    name: student.name,
                    marks: student.marks
                }
            });
        } else {
            res.status(404).json({
                success: false,
                error: "Student not found"
            });
        }
    } catch (error) {
        console.error("Update marks error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update marks"
        });
    }
});

// Delete student route (bonus feature)
app.delete("/admin/delete-student/:regNo", async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ regNo: req.params.regNo });
        if (student) {
            res.json({
                success: true,
                message: "Student deleted successfully"
            });
        } else {
            res.status(404).json({
                success: false,
                error: "Student not found"
            });
        }
    } catch (error) {
        console.error("Delete student error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete student"
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: "Something went wrong!"
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route not found"
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Student Login: http://localhost:${PORT}/`);
    console.log(`Admin Login: http://localhost:${PORT}/admin`);
    console.log(`Add Student: http://localhost:${PORT}/admin/add-student`);
    console.log(`Add Admin: http://localhost:${PORT}/admin/add-admin`);
});
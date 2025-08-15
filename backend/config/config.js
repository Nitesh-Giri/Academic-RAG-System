import mongoose from "mongoose"

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI)
        console.log("MongoDB Connected successfully")
    } catch (error) {
        console.error("Database connection error:", error)
    }
}

export default connectDB
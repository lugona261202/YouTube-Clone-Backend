import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import jwt, { decode } from "jsonwebtoken"


const generateAccessAndRefreshTokens = async (userId)=>{
   try {
      const user = await User.findById(userId)
      const accessToken = user.generateAccessToken()
      const refreshToken = user.generateRefreshToken()

      user.refreshToken = refreshToken 
      await user.save({ validateBeforeSave: false})
      return {accessToken,refreshToken}

   } catch (error) {
      throw new ApiError(500,"something went wrong while generating refresh and access token")
   }
}

const registerUser = asyncHandler(async (req,res)=>{
      //get user details from frontend
      //validation - not empty
      //check if user already exists: username,email
      //check for images , check for avatar
      // upload them to cloudinary , avatar
      // creater user object - create entry in db
      //remove password and refresh token field from response
      //  check for user creation
      // return res
      const {fullname,email,username,password}= req.body
      console.log("email: ",email);

     if(
        [fullName,email,username,password].some((field)=>field?.trim()==="")
     ){
        throw new ApiError(400,"all fields are required")
     }

     const existedUser = await  User.findOne({
        $or: [{username},{email}]
     })

     if(existedUser){
        throw new ApiError (409,"User with email or username already exists")
     }

     const avatarLocalPath = req.files?.avatar[0]?.path;
     //const coverImageLocalPath = req.files?.coverImage[0]?.path;
     // this above syntax although corrent is bringing issue so we use old standard method

     let coverImageLocalPath;
     if (req.files && Array.isArray(req.files.coverImage)&& req.files.coverImage.length >0){
      coverImageLocalPath = req.files.coverImage[0].path
     }
     
     if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
     }

     const avatar = await uploadOnCloudinary(avatarLocalPath)
     const coverImage = await uploadOnCloudinary(coverImageLocalPath) 

     if(!avatar){
        throw new ApiError(400,"Avatar file is required")
     }


     const user = await  User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username:username.toLowerCase()
     })

     const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
     )
     
     if(!createdUser){
        throw new ApiError(500,"Something went wrong while registering the user ")

     }

     return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
     )

})


const loginUser = asyncHandler(async (req,res)=>{
     // req body -> data
     // username or email 
     // find the user
     // password check 
     // access and refresh token
     // send cookie 

     const {email,username,password} = req.body

      if (!username||!email) {
         throw new ApiError(400,"username or password requrired")
      }

      const user = await User.findOne({
         $or:[{username},{email}]
      })

      if (!user){
         throw new ApiError(400,"user does not exist")
      }

      const isPasswordValid = await user.isPasswordCorrect(password)

      if (!isPasswordValid){
         throw new ApiError(401,"invalid  password")
      }

      const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id)

      const loggedInUser = await User.findById(user._id).
      select("-password -refreshToken")

      const options = {
         httpOnly: true,
         secure:true
      }

      return res
      .status(200)
      .cookie("accessToken",accessToken,options)
      .cookie("refreshToken",refreshToken,options)
      .json(
         new ApiResponse(
            200,
            {
               user: loggedInUser,accessToken,refreshToken
            },
            "user logged in successfully"
         )
      )


})

const logoutUser = asyncHandler(async(req,res)=>{
    await user.findByIdAnyUpdate(
      req.user._id,
      {
         $set:{
            refreshToken:undefined
         }
      },
      {
         new:true
      }
   )

   const options = {
      httpOnly: true,
      secure:true
   }

   return res
   .status(200)
   .clearCookie("accessToken",options)
   .clearCookie("refresToken",options)
   .json(new ApiResponse(200,{},"User logged out"))

})

const refreshAccessToken = asyncHandler( async (req,res)=>{
   const incomingRefreshToken = req.cookies.refreshToken||req.body.refreshToken

   if(!incomingRefreshToken) {
      throw new ApiError(401,"unauthorized request")
   }

   try {
      const decodedToken = jwt.verify(
         incomingRefreshToken,
         process.env.REFRESH_TOKEN_SECRET
      )
   
      const user = await User.findById(decodedToken?._id)
   
      if (!user){
         throw new ApiError(401,"invalid refresh token")
      }
   
      if(incomingRefreshToken !== user?.refreshAccessToken){
         throw new ApiError(401,"Refresh token is expired or used")
      }
   
      const options = {
         httpOnly:true,
         secure:true
      }
   
      const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
   
      return res
      .status(200)
      .cookie("accessToken",accessToken,options)
      .cookie("refreshToken",newRefreshToken,options)
      .json(
         new ApiResponse(
            200,
            {accessToken,refresToken:newRefreshToken},
            "access token refreshed"
         )
      )
   
   } catch (error) {
      throw new ApiError(401,error?.message ||"invalid refresh token")
   }

})

const changeCurrentPassword = asyncHandler(async (req,res)=>{
   const {oldPassword, newPassword} = req.body

   const user = await User.findById(req.user?._id)
   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if(!isPasswordCorrect){
      throw new ApiError(400,"invalid password")
   }

   user.password = newPassword
   await user.save({validateBeforeSave:false})

   return res
   .status(200)
   .json(new ApiResponse(200,{},"password changed successfully"))

})

const getCurrentUser = asyncHandler(async(req,res)=>{
   return res
   .status(200)
   .json( new ApiError(200,req.user,"current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
   const {fullName,email} = req.body

   if (!fullName || !email){
      throw new ApiError(400,"All fields are required")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            fullName,
            email: email
         }
      },
      {new:true}
   ).select("-password ")

   return res 
   .status (200)
   .json(new ApiResponse(200,user,"Account details updated successfully"))
})

const updateUserAvatar= asyncHandler(async(req,res)=>{
   const avatarLocalPath = req.file?.path

   if(!avatarLocalPath){
      throw new ApiError(400,"Avatar file is missing")
   }

   const avatar = await uploadOnCloudinary(avatarLocalPath)

   if(!avatar.url){
      throw new ApiError(400,"Error while uploading on avatar")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            avatar: avatar.url
         }
      },
     {new:true} 
   ).select("-password")

   return res
   .status (200)
   .json(
      new ApiResponse(200, user ,"avatar updated")
   )

})

const updateUsercoverImage = asyncHandler(async(req,res)=>{
   const coverImageLocalPath = req.file?.path

   if(!coverImageLocalPath){
      throw new ApiError(400,"cover image file is missing")
   }

   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if(!coverImage.url){
      throw new ApiError(400,"Error while uploading cover Image")
   }

   const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
         $set:{
            coverImage: coverImage.url
         }
      },
     {new:true} 
   ).select("-password")

   return res
   .status (200)
   .json(
      new ApiResponse(200, user ,"cover image updated")
   )

})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
   const {username} = req.params

   if(!username?.trim()){
      throw new ApiError(400,"username is missing")
   }

   const channel = await User.aggregate([
      {
         $match:{
            username:username?.toLowerCase()
         }
      },
      {
         $lookup:{
            from:"subscription",
            localField:"_id",
            foreignField:"channel",
            as:"subscribers"
         }
      },
      {
         $lookup:{
            from:"subscription",
            localField:"_id",
            foreignField:"subscriber",
            as:"subscribedTo"
         }
      },
      {
         $addFields:{
            subscibersCount: {
               $size:"$subscribers"
            },
            
             channelsSubscribedToCount:{
               $size:"$subscribedTo"
              },

              isSubscribed: {
                  $cond: {
                     if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                     then:true,
                     else:false
                  }
              }
            }
         
      },
      {
         $project: {
            fullname:1,
            username:1,
            subscibersCount:1,
            channelsSubscribedToCount:1,
            isSubscribed:1,
            avatar:1,
            coverImage:1,
            email:1

            
         }
      }  
   ])

   if(!channel?.length){
      throw new ApiError(404,"channel does not exists")
   }

   return res 
   .status(200)
   .json(
      new ApiResponse(200,channel[0],"User chaneel fetched successfully")
   )
})

export  {
   registerUser,
   loginUser,
   logoutUser,
   refreshAccessToken,
   changeCurrentPassword,
   getCurrentUser,
   updateAccountDetails,
   updateUserAvatar,
   updateUsercoverImage,
   getUserChannelProfile
}